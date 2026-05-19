using Microsoft.EntityFrameworkCore;
using Signal.Application.Interfaces;
using Signal.Domain.Aggregates;
using Signal.Infrastructure.Data;
using System.Linq.Expressions;

namespace Signal.Infrastructure.Repositories;

public sealed class SignalRepository(ApplicationDbContext db) : ISignalRepository
{
    public async Task<TradingSignal?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        await db.Signals.FindAsync([id], ct);

    public async Task<IReadOnlyList<TradingSignal>> GetAllAsync(CancellationToken ct = default) =>
        await db.Signals.OrderByDescending(s => s.GeneratedAt).ToListAsync(ct);

    public async Task<IReadOnlyList<TradingSignal>> FindAsync(
        Expression<Func<TradingSignal, bool>> predicate, CancellationToken ct = default) =>
        await db.Signals.Where(predicate).ToListAsync(ct);

    public async Task<IReadOnlyList<TradingSignal>> GetActiveSignalsAsync(
        string? symbol = null, CancellationToken ct = default)
    {
        var query = db.Signals
            .Where(s => s.IsActive && s.ExpiresAt > DateTime.UtcNow)
            .AsNoTracking();

        if (!string.IsNullOrWhiteSpace(symbol))
            query = query.Where(s => s.Symbol == symbol.ToUpperInvariant());

        return await query
            .OrderByDescending(s => s.ConfidenceScore)
            .Take(50)
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<TradingSignal>> GetSignalHistoryAsync(
        string symbol, DateTime from, DateTime to, CancellationToken ct = default) =>
        await db.Signals
            .Where(s => s.Symbol == symbol && s.GeneratedAt >= from && s.GeneratedAt <= to)
            .OrderByDescending(s => s.GeneratedAt)
            .AsNoTracking()
            .ToListAsync(ct);

    public async Task<TradingSignal?> GetLatestSignalAsync(string symbol, CancellationToken ct = default) =>
        await db.Signals
            .Where(s => s.Symbol == symbol && s.IsActive)
            .OrderByDescending(s => s.GeneratedAt)
            .FirstOrDefaultAsync(ct);

    public async Task InvalidateExpiredSignalsAsync(CancellationToken ct = default)
    {
        // Bulk update — avoid loading entities into memory for a mass operation
        await db.Signals
            .Where(s => s.IsActive && s.ExpiresAt <= DateTime.UtcNow)
            .ExecuteUpdateAsync(x => x.SetProperty(s => s.IsActive, false), ct);
    }

    public async Task<TradingSignal> AddAsync(TradingSignal entity, CancellationToken ct = default)
    {
        db.Signals.Add(entity);
        await db.SaveChangesAsync(ct);
        entity.ClearDomainEvents();
        return entity;
    }

    public async Task UpdateAsync(TradingSignal entity, CancellationToken ct = default)
    {
        db.Signals.Update(entity);
        await db.SaveChangesAsync(ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        await db.Signals.Where(s => s.Id == id).ExecuteDeleteAsync(ct);
    }

    public async Task<int> SaveChangesAsync(CancellationToken ct = default) =>
        await db.SaveChangesAsync(ct);
}
