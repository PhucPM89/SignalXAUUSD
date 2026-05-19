using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.EntityFrameworkCore;
using Signal.API.Extensions;
using Signal.API.Hubs;
using Signal.API.Middleware;
using Signal.API.Workers;
using Signal.Infrastructure.Data;

var builder = WebApplication.CreateBuilder(args);

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
         .AllowCredentials()));

builder.Services.AddHostedService<SignalGenerationWorker>();
builder.Services.AddHostedService<MarketTickWorker>();
builder.Services.AddHostedService<NewsIngestionWorker>();

var healthChecks = builder.Services.AddHealthChecks();
var pgConn = builder.Configuration.GetConnectionString("Postgres");
var redisConn = builder.Configuration.GetConnectionString("Redis");
if (!string.IsNullOrEmpty(pgConn))
    healthChecks.AddNpgSql(pgConn, name: "postgres");
if (!string.IsNullOrEmpty(redisConn))
    healthChecks.AddRedis(redisConn, name: "redis");

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    if (db.Database.IsRelational())
        db.Database.Migrate();
    else
        db.Database.EnsureCreated();
}

app.UseResponseCompression();
app.UseSwagger();
app.UseSwaggerUI();

app.UseMiddleware<RequestTimingMiddleware>();
app.UseMiddleware<GlobalExceptionMiddleware>();

app.UseCors("TradingFrontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<TradingHub>("/hubs/trading");
app.MapHealthChecks("/health", new HealthCheckOptions { ResponseWriter = WriteHealthResponse });

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
