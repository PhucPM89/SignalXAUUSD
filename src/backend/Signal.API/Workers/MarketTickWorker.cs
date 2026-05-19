using Microsoft.AspNetCore.SignalR;
using Signal.Application.Interfaces;
using Signal.API.Hubs;
using Signal.Infrastructure.Messaging;

namespace Signal.API.Workers;

/// <summary>
/// Streams live tick data to connected clients.
/// Each symbol runs on its own async stream — back-pressure handled by SignalR's
/// internal channel buffer. Kafka is used as the durable tick log;
/// this worker only handles the real-time push path.
/// </summary>
public sealed class MarketTickWorker(
    IServiceScopeFactory scopeFactory,
    IHubContext<TradingHub, ITradingHubClient> hub,
    ILogger<MarketTickWorker> logger) : BackgroundService
{
    private static readonly string[] Symbols = ["XAUUSD", "EURUSD", "US30", "NAS100", "BTCUSD"];

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Launch one streaming task per symbol — they run independently
        var tasks = Symbols.Select(symbol => StreamSymbolAsync(symbol, stoppingToken));
        return Task.WhenAll(tasks);
    }

    private async Task StreamSymbolAsync(string symbol, CancellationToken ct)
    {
        logger.LogInformation("Tick stream started for {Symbol}", symbol);

        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var marketData = scope.ServiceProvider.GetRequiredService<IMarketDataService>();

                await foreach (var tick in marketData.StreamTicksAsync(symbol, ct))
                {
                    var update = new TickUpdate(
                        tick.Symbol, tick.Bid, tick.Ask, tick.Mid, tick.Spread, tick.Timestamp);

                    // Broadcast to all clients subscribed to this symbol's group
                    await hub.Clients.Group($"symbol:{symbol}").OnTickReceived(update);
                }
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                logger.LogError(ex, "Tick stream error for {Symbol}, restarting in 5s", symbol);
                await Task.Delay(5000, ct);
            }
        }

        logger.LogInformation("Tick stream stopped for {Symbol}", symbol);
    }
}
