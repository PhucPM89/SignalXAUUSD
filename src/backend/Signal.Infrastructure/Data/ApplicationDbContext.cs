using Microsoft.EntityFrameworkCore;
using Signal.Domain.Aggregates;
using Signal.Domain.Entities;
using Signal.Domain.Enums;
using Signal.Domain.ValueObjects;
using System.Text.Json;

namespace Signal.Infrastructure.Data;

public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
    : DbContext(options)
{
    public DbSet<TradingSignal> Signals { get; set; } = default!;
    public DbSet<Candle> Candles { get; set; } = default!;
    public DbSet<NewsArticle> NewsArticles { get; set; } = default!;
    public DbSet<EconomicEvent> EconomicEvents { get; set; } = default!;
    public DbSet<Portfolio> Portfolios { get; set; } = default!;
    public DbSet<Position> Positions { get; set; } = default!;

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);

        // Candles: composite PK + hypertable-optimized indexes (TimescaleDB compatible)
        mb.Entity<Candle>(e =>
        {
            e.HasKey(c => c.Id);
            e.HasIndex(c => new { c.Symbol, c.Timeframe, c.OpenTime }).IsUnique();
            e.HasIndex(c => c.OpenTime);   // partition key for TimescaleDB
            e.Property(c => c.Symbol).HasMaxLength(20).IsRequired();
            e.Property(c => c.Open).HasPrecision(18, 8);
            e.Property(c => c.High).HasPrecision(18, 8);
            e.Property(c => c.Low).HasPrecision(18, 8);
            e.Property(c => c.Close).HasPrecision(18, 8);
            e.Property(c => c.Volume).HasPrecision(18, 4);
        });

        mb.Entity<TradingSignal>(e =>
        {
            e.HasKey(s => s.Id);
            e.HasIndex(s => new { s.Symbol, s.GeneratedAt });
            e.HasIndex(s => s.IsActive);
            e.Property(s => s.Symbol).HasMaxLength(20).IsRequired();
            e.Ignore(s => s.DomainEvents);

            // Owned value objects stored as JSON columns (PostgreSQL jsonb)
            e.OwnsOne(s => s.Risk, r =>
            {
                r.Property(x => x.EntryPrice).HasPrecision(18, 8);
                r.Property(x => x.StopLoss).HasPrecision(18, 8);
                r.Property(x => x.TakeProfit).HasPrecision(18, 8);
                r.Property(x => x.RiskRewardRatio).HasPrecision(10, 4);
                r.Property(x => x.WinProbability).HasPrecision(6, 4);
            });

            e.Property(s => s.HtfStructure)
                .HasConversion(
                    v => JsonSerializer.Serialize(v, JsonOptions),
                    v => JsonSerializer.Deserialize<MarketStructure>(v, JsonOptions)!)
                .HasColumnType("jsonb");

            e.Property(s => s.LtfStructure)
                .HasConversion(
                    v => JsonSerializer.Serialize(v, JsonOptions),
                    v => JsonSerializer.Deserialize<MarketStructure>(v, JsonOptions)!)
                .HasColumnType("jsonb");

            e.Property(s => s.Reasoning)
                .HasConversion(
                    v => JsonSerializer.Serialize(v, JsonOptions),
                    v => JsonSerializer.Deserialize<SignalReasoning>(v, JsonOptions)!)
                .HasColumnType("jsonb");

            e.Property(s => s.Correlations)
                .HasConversion(
                    v => JsonSerializer.Serialize(v, JsonOptions),
                    v => JsonSerializer.Deserialize<CorrelationSnapshot>(v, JsonOptions)!)
                .HasColumnType("jsonb");

            e.Property(s => s.Volatility)
                .HasConversion(
                    v => JsonSerializer.Serialize(v, JsonOptions),
                    v => JsonSerializer.Deserialize<VolatilitySnapshot>(v, JsonOptions)!)
                .HasColumnType("jsonb");
        });

        mb.Entity<NewsArticle>(e =>
        {
            e.HasKey(n => n.Id);
            e.HasIndex(n => n.PublishedAt);
            e.HasIndex(n => n.IsProcessed);
            e.Property(n => n.Headline).HasMaxLength(500).IsRequired();
            e.Property(n => n.Source).HasMaxLength(100).IsRequired();
            e.Property(n => n.AffectedInstruments)
                .HasConversion(
                    v => JsonSerializer.Serialize(v, JsonOptions),
                    v => JsonSerializer.Deserialize<List<string>>(v, JsonOptions)!);
            e.Property(n => n.MacroThemes)
                .HasConversion(
                    v => JsonSerializer.Serialize(v, JsonOptions),
                    v => JsonSerializer.Deserialize<List<string>>(v, JsonOptions)!);
        });

        mb.Entity<EconomicEvent>(e =>
        {
            e.HasKey(ev => ev.Id);
            e.HasIndex(ev => ev.ScheduledAt);
            e.HasIndex(ev => new { ev.Currency, ev.Impact });
            e.Property(ev => ev.Name).HasMaxLength(200).IsRequired();
            e.Property(ev => ev.ForecastValue).HasPrecision(18, 4);
            e.Property(ev => ev.PreviousValue).HasPrecision(18, 4);
            e.Property(ev => ev.ActualValue).HasPrecision(18, 4);
        });

        mb.Entity<Portfolio>(e =>
        {
            e.HasKey(p => p.Id);
            e.HasIndex(p => p.UserId).IsUnique();
            e.Property(p => p.Balance).HasPrecision(18, 4);
            e.Property(p => p.Equity).HasPrecision(18, 4);
            e.Ignore(p => p.OpenPositions);
        });

        mb.Entity<Position>(e =>
        {
            e.HasKey(p => p.Id);
            e.HasIndex(p => p.SignalId);
            e.HasIndex(p => p.Status);
            e.Property(p => p.EntryPrice).HasPrecision(18, 8);
            e.Property(p => p.LotSize).HasPrecision(10, 4);
        });
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };
}
