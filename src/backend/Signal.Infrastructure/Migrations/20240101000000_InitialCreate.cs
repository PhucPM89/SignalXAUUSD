using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Signal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ── Instruments ────────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "Instruments",
                columns: table => new
                {
                    Symbol = table.Column<string>(maxLength: 20, nullable: false),
                    DisplayName = table.Column<string>(maxLength: 100, nullable: false),
                    Type = table.Column<int>(nullable: false),
                    PipSize = table.Column<decimal>(precision: 18, scale: 8, nullable: false),
                    PipValue = table.Column<decimal>(precision: 18, scale: 8, nullable: false),
                    TickSize = table.Column<decimal>(precision: 18, scale: 8, nullable: false),
                    Decimals = table.Column<int>(nullable: false),
                    TypicalSpread = table.Column<decimal>(precision: 10, scale: 4, nullable: false),
                    ContractSize = table.Column<decimal>(precision: 18, scale: 4, nullable: false),
                    BaseCurrency = table.Column<string>(maxLength: 10, nullable: false),
                    QuoteCurrency = table.Column<string>(maxLength: 10, nullable: false),
                    PrimarySession = table.Column<int>(nullable: false),
                    IsActive = table.Column<bool>(nullable: false, defaultValue: true)
                },
                constraints: table => table.PrimaryKey("PK_Instruments", x => x.Symbol));

            // ── Candles — TimescaleDB hypertable (time-series optimised) ──
            migrationBuilder.CreateTable(
                name: "Candles",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    Symbol = table.Column<string>(maxLength: 20, nullable: false),
                    Timeframe = table.Column<int>(nullable: false),
                    OpenTime = table.Column<DateTime>(nullable: false),
                    CloseTime = table.Column<DateTime>(nullable: false),
                    Open = table.Column<decimal>(precision: 18, scale: 8, nullable: false),
                    High = table.Column<decimal>(precision: 18, scale: 8, nullable: false),
                    Low = table.Column<decimal>(precision: 18, scale: 8, nullable: false),
                    Close = table.Column<decimal>(precision: 18, scale: 8, nullable: false),
                    Volume = table.Column<decimal>(precision: 18, scale: 4, nullable: false)
                },
                constraints: table => table.PrimaryKey("PK_Candles", x => x.Id));

            migrationBuilder.CreateIndex("IX_Candles_Symbol_Timeframe_OpenTime", "Candles",
                new[] { "Symbol", "Timeframe", "OpenTime" }, unique: true);
            migrationBuilder.CreateIndex("IX_Candles_OpenTime", "Candles", "OpenTime");

            // Convert to TimescaleDB hypertable (raw SQL — EF does not support this natively)
            migrationBuilder.Sql(
                "SELECT create_hypertable('\"Candles\"', 'OpenTime', if_not_exists => TRUE);",
                suppressTransaction: true);

            // ── Trading Signals ────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "Signals",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    Symbol = table.Column<string>(maxLength: 20, nullable: false),
                    Direction = table.Column<int>(nullable: false),
                    Strength = table.Column<int>(nullable: false),
                    ConfidenceScore = table.Column<int>(nullable: false),
                    Regime = table.Column<int>(nullable: false),
                    Session = table.Column<int>(nullable: false),
                    MacroSentiment = table.Column<int>(nullable: false),
                    NewsImpact = table.Column<int>(nullable: false),
                    IsActive = table.Column<bool>(nullable: false, defaultValue: true),
                    GeneratedAt = table.Column<DateTime>(nullable: false),
                    ExpiresAt = table.Column<DateTime>(nullable: false),
                    // Owned Risk
                    Risk_EntryPrice = table.Column<decimal>(precision: 18, scale: 8, nullable: false),
                    Risk_StopLoss = table.Column<decimal>(precision: 18, scale: 8, nullable: false),
                    Risk_TakeProfit = table.Column<decimal>(precision: 18, scale: 8, nullable: false),
                    Risk_RiskRewardRatio = table.Column<decimal>(precision: 10, scale: 4, nullable: false),
                    Risk_StopLossPips = table.Column<decimal>(precision: 10, scale: 2, nullable: false),
                    Risk_TakeProfitPips = table.Column<decimal>(precision: 10, scale: 2, nullable: false),
                    Risk_WinProbability = table.Column<decimal>(precision: 6, scale: 4, nullable: false),
                    Risk_ExpectedValue = table.Column<decimal>(precision: 10, scale: 4, nullable: false),
                    // JSON columns (PostgreSQL jsonb)
                    HtfStructure = table.Column<string>(type: "jsonb", nullable: false),
                    LtfStructure = table.Column<string>(type: "jsonb", nullable: false),
                    Reasoning = table.Column<string>(type: "jsonb", nullable: false),
                    Correlations = table.Column<string>(type: "jsonb", nullable: false),
                    Volatility = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table => table.PrimaryKey("PK_Signals", x => x.Id));

            migrationBuilder.CreateIndex("IX_Signals_Symbol_GeneratedAt", "Signals",
                new[] { "Symbol", "GeneratedAt" });
            migrationBuilder.CreateIndex("IX_Signals_IsActive", "Signals", "IsActive");

            // ── News Articles ──────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "NewsArticles",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    Headline = table.Column<string>(maxLength: 500, nullable: false),
                    Body = table.Column<string>(nullable: true),
                    Source = table.Column<string>(maxLength: 100, nullable: false),
                    Url = table.Column<string>(nullable: true),
                    PublishedAt = table.Column<DateTime>(nullable: false),
                    Impact = table.Column<int>(nullable: false),
                    Sentiment = table.Column<int>(nullable: false),
                    SentimentScore = table.Column<decimal>(precision: 6, scale: 4, nullable: false),
                    MarketImpactScore = table.Column<decimal>(precision: 6, scale: 4, nullable: false),
                    AffectedInstruments = table.Column<string>(nullable: false, defaultValue: "[]"),
                    MacroThemes = table.Column<string>(nullable: false, defaultValue: "[]"),
                    IsProcessed = table.Column<bool>(nullable: false, defaultValue: false),
                    IsFiltered = table.Column<bool>(nullable: false, defaultValue: false),
                    FilterReason = table.Column<string>(nullable: true)
                },
                constraints: table => table.PrimaryKey("PK_NewsArticles", x => x.Id));

            migrationBuilder.CreateIndex("IX_NewsArticles_PublishedAt", "NewsArticles", "PublishedAt");
            migrationBuilder.CreateIndex("IX_NewsArticles_IsProcessed", "NewsArticles", "IsProcessed");

            // ── Economic Events ────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "EconomicEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    Name = table.Column<string>(maxLength: 200, nullable: false),
                    Currency = table.Column<string>(maxLength: 10, nullable: false),
                    Country = table.Column<string>(maxLength: 50, nullable: false),
                    Impact = table.Column<int>(nullable: false),
                    ScheduledAt = table.Column<DateTime>(nullable: false),
                    ForecastValue = table.Column<decimal>(precision: 18, scale: 4, nullable: true),
                    PreviousValue = table.Column<decimal>(precision: 18, scale: 4, nullable: true),
                    ActualValue = table.Column<decimal>(precision: 18, scale: 4, nullable: true),
                    IsReleased = table.Column<bool>(nullable: false, defaultValue: false),
                    SurpriseScore = table.Column<decimal>(precision: 10, scale: 4, nullable: true)
                },
                constraints: table => table.PrimaryKey("PK_EconomicEvents", x => x.Id));

            migrationBuilder.CreateIndex("IX_EconomicEvents_ScheduledAt", "EconomicEvents", "ScheduledAt");
            migrationBuilder.CreateIndex("IX_EconomicEvents_Currency_Impact", "EconomicEvents",
                new[] { "Currency", "Impact" });

            // ── Portfolios ─────────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "Portfolios",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    UserId = table.Column<string>(maxLength: 100, nullable: false),
                    Balance = table.Column<decimal>(precision: 18, scale: 4, nullable: false),
                    Equity = table.Column<decimal>(precision: 18, scale: 4, nullable: false),
                    Margin = table.Column<decimal>(precision: 18, scale: 4, nullable: false),
                    RiskProfile = table.Column<int>(nullable: false),
                    MaxDailyDrawdown = table.Column<decimal>(precision: 6, scale: 2, nullable: false),
                    CurrentDailyDrawdown = table.Column<decimal>(precision: 6, scale: 2, nullable: false),
                    MaxRiskPerTrade = table.Column<decimal>(precision: 6, scale: 2, nullable: false),
                    LastUpdated = table.Column<DateTime>(nullable: false)
                },
                constraints: table => table.PrimaryKey("PK_Portfolios", x => x.Id));

            migrationBuilder.CreateIndex("IX_Portfolios_UserId", "Portfolios", "UserId", unique: true);

            // ── Positions ──────────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "Positions",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    SignalId = table.Column<Guid>(nullable: false),
                    Symbol = table.Column<string>(maxLength: 20, nullable: false),
                    Direction = table.Column<int>(nullable: false),
                    EntryPrice = table.Column<decimal>(precision: 18, scale: 8, nullable: false),
                    CurrentPrice = table.Column<decimal>(precision: 18, scale: 8, nullable: false),
                    StopLoss = table.Column<decimal>(precision: 18, scale: 8, nullable: false),
                    TakeProfit = table.Column<decimal>(precision: 18, scale: 8, nullable: false),
                    LotSize = table.Column<decimal>(precision: 10, scale: 4, nullable: false),
                    UnrealizedPnL = table.Column<decimal>(precision: 18, scale: 4, nullable: false),
                    RealizedPnL = table.Column<decimal>(precision: 18, scale: 4, nullable: false),
                    Status = table.Column<int>(nullable: false),
                    OpenedAt = table.Column<DateTime>(nullable: false),
                    ClosedAt = table.Column<DateTime>(nullable: true)
                },
                constraints: table => table.PrimaryKey("PK_Positions", x => x.Id));

            migrationBuilder.CreateIndex("IX_Positions_SignalId", "Positions", "SignalId");
            migrationBuilder.CreateIndex("IX_Positions_Status", "Positions", "Status");

            // ── Seed XAUUSD instrument ─────────────────────────────────────
            migrationBuilder.InsertData(
                table: "Instruments",
                columns: new[] { "Symbol","DisplayName","Type","PipSize","PipValue",
                                 "TickSize","Decimals","TypicalSpread","ContractSize",
                                 "BaseCurrency","QuoteCurrency","PrimarySession","IsActive" },
                values: new object[] { "XAUUSD","Gold / US Dollar",1,0.01m,1.0m,
                                       0.01m,2,0.25m,100m,"XAU","USD",3,true });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable("Positions");
            migrationBuilder.DropTable("Portfolios");
            migrationBuilder.DropTable("EconomicEvents");
            migrationBuilder.DropTable("NewsArticles");
            migrationBuilder.DropTable("Signals");
            migrationBuilder.DropTable("Candles");
            migrationBuilder.DropTable("Instruments");
        }
    }
}
