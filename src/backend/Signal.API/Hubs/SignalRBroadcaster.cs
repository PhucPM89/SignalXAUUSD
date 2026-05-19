using Microsoft.AspNetCore.SignalR;
using Signal.Application.DTOs;
using Signal.Application.Interfaces;
using Signal.Infrastructure.Messaging;

namespace Signal.API.Hubs;

public sealed class SignalRBroadcaster(IHubContext<TradingHub, ITradingHubClient> hub) : ISignalBroadcaster
{
    public async Task BroadcastSignalAsync(SignalDto dto, string symbol, bool institutionalGrade, CancellationToken ct = default)
    {
        await hub.Clients.Group($"symbol:{symbol}").OnSignalReceived(dto);
        if (institutionalGrade)
            await hub.Clients.Group("institutional").OnInstitutionalSignal(dto);
    }

    public Task BroadcastRegimeChangeAsync(string symbol, string regime, CancellationToken ct = default) =>
        hub.Clients.Group($"symbol:{symbol}").OnRegimeChanged(symbol, regime);

    public Task BroadcastTickAsync(string symbol, decimal bid, decimal ask, DateTime timestamp, CancellationToken ct = default) =>
        hub.Clients.Group($"symbol:{symbol}")
            .OnTickReceived(new TickUpdate(symbol, bid, ask, (bid + ask) / 2, ask - bid, timestamp));
}
