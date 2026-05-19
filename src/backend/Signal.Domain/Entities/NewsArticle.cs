using Signal.Domain.Enums;

namespace Signal.Domain.Entities;

public sealed class NewsArticle
{
    public Guid Id { get; private set; }
    public string Headline { get; private set; } = default!;
    public string? Body { get; private set; }
    public string Source { get; private set; } = default!;
    public string? Url { get; private set; }
    public DateTime PublishedAt { get; private set; }
    public NewsImpact Impact { get; private set; }
    public MacroSentiment Sentiment { get; private set; }
    public decimal SentimentScore { get; private set; }    // -1.0 to +1.0
    public decimal MarketImpactScore { get; private set; } // 0.0 to 1.0
    public List<string> AffectedInstruments { get; private set; } = [];
    public List<string> MacroThemes { get; private set; } = [];
    public bool IsProcessed { get; private set; }
    public bool IsFiltered { get; private set; }           // flagged as spam/irrelevant
    public string? FilterReason { get; private set; }

    private NewsArticle() { }

    public static NewsArticle Create(
        string headline, string source, DateTime publishedAt,
        string? body = null, string? url = null)
    {
        if (string.IsNullOrWhiteSpace(headline)) throw new ArgumentException("Headline required.");
        if (string.IsNullOrWhiteSpace(source)) throw new ArgumentException("Source required.");

        return new NewsArticle
        {
            Id = Guid.NewGuid(),
            Headline = headline,
            Body = body,
            Source = source,
            Url = url,
            PublishedAt = publishedAt,
            Impact = NewsImpact.None,
            Sentiment = MacroSentiment.Neutral,
            IsProcessed = false,
            IsFiltered = false
        };
    }

    public void ApplyNlpAnalysis(
        MacroSentiment sentiment,
        decimal sentimentScore,
        NewsImpact impact,
        decimal marketImpactScore,
        List<string> affectedInstruments,
        List<string> macroThemes)
    {
        Sentiment = sentiment;
        SentimentScore = Math.Clamp(sentimentScore, -1.0m, 1.0m);
        Impact = impact;
        MarketImpactScore = Math.Clamp(marketImpactScore, 0.0m, 1.0m);
        AffectedInstruments = affectedInstruments;
        MacroThemes = macroThemes;
        IsProcessed = true;
    }

    public void MarkAsFiltered(string reason)
    {
        IsFiltered = true;
        FilterReason = reason;
    }
}

public sealed class EconomicEvent
{
    public Guid Id { get; private set; }
    public string Name { get; private set; } = default!;
    public string Currency { get; private set; } = default!;
    public string Country { get; private set; } = default!;
    public NewsImpact Impact { get; private set; }
    public DateTime ScheduledAt { get; private set; }
    public decimal? ForecastValue { get; private set; }
    public decimal? PreviousValue { get; private set; }
    public decimal? ActualValue { get; private set; }
    public bool IsReleased { get; private set; }
    public decimal? SurpriseScore { get; private set; }   // Actual vs Forecast deviation

    private EconomicEvent() { }

    public static EconomicEvent Create(
        string name, string currency, string country,
        NewsImpact impact, DateTime scheduledAt,
        decimal? forecast = null, decimal? previous = null)
    {
        return new EconomicEvent
        {
            Id = Guid.NewGuid(),
            Name = name,
            Currency = currency,
            Country = country,
            Impact = impact,
            ScheduledAt = scheduledAt,
            ForecastValue = forecast,
            PreviousValue = previous,
            IsReleased = false
        };
    }

    public void Release(decimal actual)
    {
        ActualValue = actual;
        IsReleased = true;
        if (ForecastValue.HasValue && ForecastValue.Value != 0)
            SurpriseScore = (actual - ForecastValue.Value) / Math.Abs(ForecastValue.Value);
    }

    public bool IsHighImpact => Impact >= NewsImpact.High;
    public bool IsUpcoming(TimeSpan window) =>
        !IsReleased && ScheduledAt > DateTime.UtcNow && ScheduledAt <= DateTime.UtcNow.Add(window);
    public bool IsRecent(TimeSpan window) =>
        IsReleased && ScheduledAt >= DateTime.UtcNow.Subtract(window);
}
