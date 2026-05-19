using Microsoft.AspNetCore.SignalR;
using Signal.API.Hubs;
using Signal.Application.Interfaces;
using Signal.Domain.Entities;
using Signal.Domain.Enums;
using Signal.Infrastructure.Messaging;
using System.Net.Http.Json;

namespace Signal.API.Workers;

/// <summary>
/// Polls news APIs every 30 seconds and sends articles to the NLP service for processing.
/// High-impact events are immediately pushed to clients via SignalR.
///
/// Polling vs WebSocket: news feeds from most providers (NewsAPI, Finnhub, Alpha Vantage)
/// are REST-only. We poll at 30s intervals — sufficient for swing/intraday trading
/// where a 30-second news lag does not materially impact entry quality.
/// </summary>
public sealed class NewsIngestionWorker(
    IServiceScopeFactory scopeFactory,
    IHubContext<TradingHub, ITradingHubClient> hub,
    IHttpClientFactory httpFactory,
    IConfiguration config,
    ILogger<NewsIngestionWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("News ingestion worker started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await IngestNewsAsync(stoppingToken);
                await CheckEconomicCalendarAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "News ingestion error");
            }

            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
    }

    private async Task IngestNewsAsync(CancellationToken ct)
    {
        var client = httpFactory.CreateClient("NewsAPI");
        var apiKey = config["News:FinnhubApiKey"];
        var url = $"/api/v1/news?category=forex&token={apiKey}";

        FinnhubArticle[]? articles;
        try
        {
            articles = await client.GetFromJsonAsync<FinnhubArticle[]>(url, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to fetch news from Finnhub");
            return;
        }

        if (articles is null || articles.Length == 0) return;

        using var scope = scopeFactory.CreateScope();
        var newsRepo = scope.ServiceProvider.GetRequiredService<INewsRepository>();
        var nlpClient = httpFactory.CreateClient("NlpService");

        foreach (var article in articles.Take(20))
        {
            // Avoid duplicates via URL dedup
            var existing = await newsRepo.FindAsync(n => n.Url == article.Url, ct);
            if (existing.Count > 0) continue;

            var newsArticle = NewsArticle.Create(
                article.Headline, article.Source,
                DateTimeOffset.FromUnixTimeSeconds(article.Datetime).UtcDateTime,
                article.Summary, article.Url);

            await newsRepo.AddAsync(newsArticle, ct);

            // Send to NLP service for sentiment analysis (async, non-blocking)
            _ = ProcessWithNlpAsync(nlpClient, newsArticle, newsRepo, ct);
        }
    }

    private static async Task ProcessWithNlpAsync(
        HttpClient nlpClient, NewsArticle article, INewsRepository newsRepo, CancellationToken ct)
    {
        try
        {
            var response = await nlpClient.PostAsJsonAsync("/analyze", new
            {
                id = article.Id,
                headline = article.Headline,
                body = article.Body
            }, ct);

            if (!response.IsSuccessStatusCode) return;

            var result = await response.Content.ReadFromJsonAsync<NlpResult>(ct);
            if (result is null) return;

            article.ApplyNlpAnalysis(
                Enum.Parse<MacroSentiment>(result.Sentiment, ignoreCase: true),
                result.SentimentScore,
                Enum.Parse<NewsImpact>(result.Impact, ignoreCase: true),
                result.MarketImpactScore,
                result.AffectedInstruments,
                result.MacroThemes);

            await newsRepo.UpdateAsync(article, ct);
        }
        catch { /* NLP service errors don't block ingestion */ }
    }

    private async Task CheckEconomicCalendarAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var newsRepo = scope.ServiceProvider.GetRequiredService<INewsRepository>();

        var upcoming = await newsRepo.GetUpcomingEventsAsync(TimeSpan.FromMinutes(30), ct);
        foreach (var ev in upcoming.Where(e => e.IsHighImpact))
        {
            var dto = new EconomicEventDto(
                ev.Name, ev.Currency, ev.Impact.ToString(),
                ev.ScheduledAt, ev.ActualValue, ev.ForecastValue);

            // Alert all clients subscribed to instruments affected by this currency
            await hub.Clients.All.OnEconomicEvent(dto);
            logger.LogInformation("Economic alert: {Name} ({Currency}) in {Min}min",
                ev.Name, ev.Currency,
                Math.Round((ev.ScheduledAt - DateTime.UtcNow).TotalMinutes, 1));
        }
    }

    private record FinnhubArticle(string Headline, string Summary, string Source, string Url, long Datetime);
    private record NlpResult(
        string Sentiment, decimal SentimentScore, string Impact, decimal MarketImpactScore,
        List<string> AffectedInstruments, List<string> MacroThemes);
}
