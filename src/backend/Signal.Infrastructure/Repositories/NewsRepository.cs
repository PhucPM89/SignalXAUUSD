using Microsoft.EntityFrameworkCore;
using Signal.Application.Interfaces;
using Signal.Domain.Entities;
using Signal.Domain.Enums;
using Signal.Infrastructure.Data;
using System.Linq.Expressions;

namespace Signal.Infrastructure.Repositories;

public sealed class NewsRepository(ApplicationDbContext db) : INewsRepository
{
    public async Task<NewsArticle?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        await db.NewsArticles.FindAsync([id], ct);

    public async Task<IReadOnlyList<NewsArticle>> GetAllAsync(CancellationToken ct = default) =>
        await db.NewsArticles.OrderByDescending(n => n.PublishedAt).Take(100).ToListAsync(ct);

    public async Task<IReadOnlyList<NewsArticle>> FindAsync(
        Expression<Func<NewsArticle, bool>> predicate, CancellationToken ct = default) =>
        await db.NewsArticles.Where(predicate).ToListAsync(ct);

    public async Task<NewsArticle> AddAsync(NewsArticle entity, CancellationToken ct = default)
    {
        db.NewsArticles.Add(entity);
        await db.SaveChangesAsync(ct);
        return entity;
    }

    public async Task UpdateAsync(NewsArticle entity, CancellationToken ct = default)
    {
        db.NewsArticles.Update(entity);
        await db.SaveChangesAsync(ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default) =>
        await db.NewsArticles.Where(n => n.Id == id).ExecuteDeleteAsync(ct);

    public async Task<int> SaveChangesAsync(CancellationToken ct = default) =>
        await db.SaveChangesAsync(ct);

    public async Task<IReadOnlyList<NewsArticle>> GetUnprocessedAsync(
        int batchSize = 50, CancellationToken ct = default) =>
        await db.NewsArticles
            .Where(n => !n.IsProcessed && !n.IsFiltered)
            .OrderBy(n => n.PublishedAt)
            .Take(batchSize)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<NewsArticle>> GetHighImpactAsync(
        DateTime since, CancellationToken ct = default) =>
        await db.NewsArticles
            .Where(n => n.PublishedAt >= since && n.Impact >= NewsImpact.High && n.IsProcessed)
            .OrderByDescending(n => n.MarketImpactScore)
            .Take(20)
            .AsNoTracking()
            .ToListAsync(ct);

    public async Task<IReadOnlyList<EconomicEvent>> GetUpcomingEventsAsync(
        TimeSpan window, CancellationToken ct = default) =>
        await db.EconomicEvents
            .Where(e => !e.IsReleased && e.ScheduledAt > DateTime.UtcNow && e.ScheduledAt <= DateTime.UtcNow.Add(window))
            .OrderBy(e => e.ScheduledAt)
            .AsNoTracking()
            .ToListAsync(ct);

    public async Task<IReadOnlyList<EconomicEvent>> GetTodayHighImpactAsync(CancellationToken ct = default)
    {
        var today = DateTime.UtcNow.Date;
        var tomorrow = today.AddDays(1);
        return await db.EconomicEvents
            .Where(e => e.ScheduledAt >= today && e.ScheduledAt < tomorrow && e.Impact >= NewsImpact.High)
            .OrderBy(e => e.ScheduledAt)
            .AsNoTracking()
            .ToListAsync(ct);
    }
}
