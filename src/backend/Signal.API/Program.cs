using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.EntityFrameworkCore;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Signal.API.Extensions;
using Signal.API.Hubs;
using Signal.API.Middleware;
using Signal.API.Workers;
using Signal.Infrastructure.Data;

var builder = WebApplication.CreateBuilder(args);

// ── Services ──────────────────────────────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "Signal Trading API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new()
    {
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme = "bearer", BearerFormat = "JWT"
    });
    c.AddSecurityRequirement(new()
    {
        [new() { Reference = new() { Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme, Id = "Bearer" } }] = []
    });
});

builder.Services.AddApplicationServices();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddJwtAuthentication(builder.Configuration);
builder.Services.AddSignalRWithRedisBackplane(builder.Configuration);
builder.Services.AddAuthorization();
builder.Services.AddResponseCompression(opts => opts.EnableForHttps = true);
builder.Services.AddCors(opts =>
    opts.AddPolicy("TradingFrontend", p =>
        p.WithOrigins(builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? ["http://localhost:3000"])
         .AllowAnyHeader()
         .AllowAnyMethod()
         .AllowCredentials()));   // required for SignalR cookies/auth

// Background workers
builder.Services.AddHostedService<SignalGenerationWorker>();
builder.Services.AddHostedService<MarketTickWorker>();
builder.Services.AddHostedService<NewsIngestionWorker>();

// ── Observability ─────────────────────────────────────────────────────────────
builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService("Signal.API"))
    .WithTracing(t => t
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddEntityFrameworkCoreInstrumentation()
        .AddSource("Signal.*")
        .AddOtlpExporter(o => o.Endpoint = new Uri(
            builder.Configuration["OtelCollector:Endpoint"] ?? "http://otel-collector:4317")))
    .WithMetrics(m => m
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddRuntimeInstrumentation()
        .AddMeter("Signal.SignalEngine")
        .AddPrometheusExporter());

var healthChecks = builder.Services.AddHealthChecks();
var pgConn = builder.Configuration.GetConnectionString("Postgres");
var redisConn = builder.Configuration.GetConnectionString("Redis");
if (!string.IsNullOrEmpty(pgConn))
    healthChecks.AddNpgSql(pgConn, name: "postgres");
if (!string.IsNullOrEmpty(redisConn))
    healthChecks.AddRedis(redisConn, name: "redis");

// ── App Pipeline ──────────────────────────────────────────────────────────────
var app = builder.Build();

// Auto-migrate only when using a real Postgres DB (not in-memory)
if (!string.IsNullOrEmpty(app.Configuration.GetConnectionString("Postgres")))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    db.Database.Migrate();
}

app.UseResponseCompression();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseMiddleware<RequestTimingMiddleware>();
app.UseMiddleware<GlobalExceptionMiddleware>();

app.UseCors("TradingFrontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<TradingHub>("/hubs/trading");
app.MapPrometheusScrapingEndpoint("/metrics");   // Prometheus scrape target
app.MapHealthChecks("/health", new HealthCheckOptions { ResponseWriter = WriteHealthResponse });
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = hc => hc.Tags.Contains("ready")
});

app.Run();

static Task WriteHealthResponse(HttpContext ctx, Microsoft.Extensions.Diagnostics.HealthChecks.HealthReport report)
{
    ctx.Response.ContentType = "application/json";
    var result = System.Text.Json.JsonSerializer.Serialize(new
    {
        status = report.Status.ToString(),
        checks = report.Entries.Select(e => new { name = e.Key, status = e.Value.Status.ToString() }),
        duration = report.TotalDuration
    });
    return ctx.Response.WriteAsync(result);
}
