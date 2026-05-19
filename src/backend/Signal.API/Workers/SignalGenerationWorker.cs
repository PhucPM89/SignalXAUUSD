using MediatR;
using Signal.Application.Commands;

namespace Signal.API.Workers;

/// <summary>
/// Single-instrument signal loop for XAUUSD.
/// Runs every 2 seconds during active sessions, slows to 10s during dead sessions
/// (Asia early / off-hours) to conserve resources and avoid noise.
///
/// Why a semaphore: signal analysis can take 100–400ms (AI inference round-trip).
/// Without a semaphore, cycles stack under load and you get stale overlapping analyses.
/// </summary>
public sealed class SignalGenerationWorker(
    IServiceScopeFactory scopeFactory,
    IConfiguration config,
    ILogger<SignalGenerationWorker> logger) : BackgroundService
{
    private const string Symbol = "XAUUSD";
    private readonly SemaphoreSlim _semaphore = new(1, 1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("XAUUSD signal generation worker started");

        while (!stoppingToken.IsCancellationRequested)
        {
            var utcHour = DateTime.UtcNow.Hour;
            var intervalMs = Domain.Entities.GoldInstrument.IsDeadSession(utcHour) ? 10_000 : 2_000;

            if (!await _semaphore.WaitAsync(0, stoppingToken))
            {
                await Task.Delay(intervalMs, stoppingToken);
                continue;
            }

            var cycleStart = DateTime.UtcNow;
            try
            {
                await AnalyzeXauUsdAsync(stoppingToken);
            }
            finally
            {
                _semaphore.Release();
            }

            var elapsed = (DateTime.UtcNow - cycleStart).TotalMilliseconds;
            if (elapsed > intervalMs)
                logger.LogWarning("XAUUSD cycle took {Ms}ms (target {Target}ms)", (int)elapsed, intervalMs);

            var delay = Math.Max(0, intervalMs - (int)elapsed);
            await Task.Delay(delay, stoppingToken);
        }
    }

    private async Task AnalyzeXauUsdAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();
        try
        {
            await mediator.Send(new GenerateSignalCommand(Symbol), ct);
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unhandled error in XAUUSD signal analysis");
        }
    }
}
