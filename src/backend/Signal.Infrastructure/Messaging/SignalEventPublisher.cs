using Confluent.Kafka;
using Microsoft.Extensions.Logging;
using Signal.Application.DTOs;
using Signal.Application.Interfaces;
using Signal.Domain.Aggregates;
using Signal.Domain.Enums;
using System.Text.Json;

namespace Signal.Infrastructure.Messaging;

/// <summary>
/// Dual-path publisher:
///   1. Kafka → async fan-out for downstream consumers (logging, ML feedback, analytics)
///   2. SignalR via ISignalBroadcaster → real-time push to browser clients (&lt;50ms)
///
/// Kafka is the source of truth; SignalR is the presentation layer.
/// </summary>
public sealed class SignalEventPublisher(
    IProducer<string, string> kafkaProducer,
    ISignalBroadcaster broadcaster,
    ILogger<SignalEventPublisher> logger) : INotificationService
{
    private const string SignalsTopic = "trading-signals";
    private const string AlertsTopic = "trading-alerts";
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public async Task SendSignalAlertAsync(TradingSignal signal, CancellationToken ct = default)
    {
        var dto = SignalDto.FromDomain(signal);
        var payload = JsonSerializer.Serialize(dto, JsonOpts);

        await kafkaProducer.ProduceAsync(SignalsTopic,
            new Message<string, string>
            {
                Key = signal.Symbol,
                Value = payload,
                Headers = new Headers
                {
                    { "signal-id", System.Text.Encoding.UTF8.GetBytes(signal.Id.ToString()) },
                    { "direction", System.Text.Encoding.UTF8.GetBytes(signal.Direction.ToString()) },
                    { "confidence", System.Text.Encoding.UTF8.GetBytes(signal.ConfidenceScore.ToString()) }
                }
            }, ct);

        await broadcaster.BroadcastSignalAsync(dto, signal.Symbol, signal.IsInstitutionalGrade, ct);

        logger.LogDebug("Published signal {Id} for {Symbol} via Kafka + SignalR", signal.Id, signal.Symbol);
    }

    public async Task SendRegimeChangeAlertAsync(MarketRegime regime, string symbol, CancellationToken ct = default)
    {
        var payload = JsonSerializer.Serialize(new { symbol, regime = regime.ToString(), timestamp = DateTime.UtcNow }, JsonOpts);

        await kafkaProducer.ProduceAsync(AlertsTopic,
            new Message<string, string> { Key = symbol, Value = payload }, ct);

        await broadcaster.BroadcastRegimeChangeAsync(symbol, regime.ToString(), ct);
    }
}

// SignalR Hub contract — defined here so Infrastructure can reference it for ITradingHubClient
// without creating a circular dependency back to Signal.API.
public interface ITradingHubClient
{
    Task OnSignalReceived(SignalDto signal);
    Task OnInstitutionalSignal(SignalDto signal);
    Task OnTickReceived(TickUpdate tick);
    Task OnRegimeChanged(string symbol, string regime);
    Task OnNewsAlert(NewsAlertDto news);
    Task OnEconomicEvent(EconomicEventDto evt);
    Task OnPortfolioUpdate(PortfolioUpdateDto update);
}

public record TickUpdate(string Symbol, decimal Bid, decimal Ask, decimal Mid, decimal Spread, DateTime Timestamp);
public record NewsAlertDto(string Headline, string Source, string Impact, decimal SentimentScore, DateTime PublishedAt);
public record EconomicEventDto(string Name, string Currency, string Impact, DateTime ScheduledAt, decimal? Actual, decimal? Forecast);
public record PortfolioUpdateDto(decimal Balance, decimal Equity, decimal FreeMargin, decimal MarginLevel, List<PositionSummary> Positions);
public record PositionSummary(string Symbol, string Direction, decimal EntryPrice, decimal CurrentPrice, decimal UnrealizedPnL);
