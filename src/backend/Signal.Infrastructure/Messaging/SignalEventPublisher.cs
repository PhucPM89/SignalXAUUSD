using Microsoft.Extensions.Logging;
using Signal.Application.DTOs;
using Signal.Application.Interfaces;
using Signal.Domain.Aggregates;
using Signal.Domain.Enums;
using System.Text.Json;

namespace Signal.Infrastructure.Messaging;

public sealed class SignalEventPublisher(
    ISignalBroadcaster broadcaster,
    ILogger<SignalEventPublisher> logger) : INotificationService
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public async Task SendSignalAlertAsync(TradingSignal signal, CancellationToken ct = default)
    {
        var dto = SignalDto.FromDomain(signal);
        await broadcaster.BroadcastSignalAsync(dto, signal.Symbol, signal.IsInstitutionalGrade, ct);
        logger.LogDebug("Broadcast signal {Id} for {Symbol} via SignalR", signal.Id, signal.Symbol);
    }

    public async Task SendRegimeChangeAlertAsync(MarketRegime regime, string symbol, CancellationToken ct = default)
    {
        await broadcaster.BroadcastRegimeChangeAsync(symbol, regime.ToString(), ct);
    }
}

// SignalR Hub contract — defined here so Infrastructure can reference it without circular dependency back to Signal.API.
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
