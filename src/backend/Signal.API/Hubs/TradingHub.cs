using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Signal.Application.DTOs;
using Signal.Application.Interfaces;
using Signal.Infrastructure.Messaging;

namespace Signal.API.Hubs;

/// <summary>
/// Real-time hub — clients subscribe to symbols and receive sub-100ms signal/tick updates.
///
/// Group strategy:
///   "symbol:{XAUUSD}" — all clients watching a specific instrument
///   "institutional"   — clients who want only high-confidence signals
///   "user:{userId}"   — per-user portfolio updates
///
/// Why SignalR over raw WebSockets: automatic backpressure, group management,
/// reconnection protocol, and ASP.NET auth integration out of the box.
/// </summary>
[Authorize]
public sealed class TradingHub(
    ISignalRepository signalRepo,
    IMarketDataService marketData,
    ILogger<TradingHub> logger) : Hub<ITradingHubClient>
{
    public override async Task OnConnectedAsync()
    {
        var userId = Context.UserIdentifier ?? Context.ConnectionId;
        logger.LogInformation("Client connected: {ConnectionId}", Context.ConnectionId);

        // Add to user-specific group for portfolio updates
        await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{userId}");
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (exception is not null)
            logger.LogWarning(exception, "Client disconnected with error: {ConnectionId}", Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>Subscribe to live updates for a symbol.</summary>
    public async Task SubscribeToSymbol(string symbol)
    {
        symbol = symbol.ToUpperInvariant();
        await Groups.AddToGroupAsync(Context.ConnectionId, $"symbol:{symbol}");
        logger.LogDebug("Connection {Id} subscribed to {Symbol}", Context.ConnectionId, symbol);

        // Send current active signals immediately on subscribe (cache warm-up for client)
        var signals = await signalRepo.GetActiveSignalsAsync(symbol);
        foreach (var sig in signals.Where(s => s.IsActive && s.IsInstitutionalGrade))
            await Clients.Caller.OnSignalReceived(SignalDto.FromDomain(sig));
    }

    public async Task UnsubscribeFromSymbol(string symbol)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"symbol:{symbol.ToUpperInvariant()}");
    }

    /// <summary>Subscribe to institutional-grade only signals across all instruments.</summary>
    public async Task SubscribeInstitutional()
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, "institutional");
    }

    /// <summary>Client requests current tick for a symbol (REST-over-hub pattern for convenience).</summary>
    public async Task<TickUpdate?> GetCurrentTick(string symbol)
    {
        try
        {
            var price = await marketData.GetCurrentPriceAsync(symbol.ToUpperInvariant());
            return new TickUpdate(symbol, price - 0.01m, price + 0.01m, price, 0.02m, DateTime.UtcNow);
        }
        catch
        {
            return null;
        }
    }
}
