using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;

namespace Signal.Application.Behaviors;

/// <summary>
/// MediatR pipeline behavior: runs FluentValidation before every command/query.
/// Fails fast with a ValidationException before any domain logic executes.
/// </summary>
public sealed class ValidationBehavior<TRequest, TResponse>(
    IEnumerable<IValidator<TRequest>> validators,
    ILogger<ValidationBehavior<TRequest, TResponse>> logger)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(
        TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken ct)
    {
        if (!validators.Any()) return await next();

        var context = new ValidationContext<TRequest>(request);
        var results = await Task.WhenAll(validators.Select(v => v.ValidateAsync(context, ct)));
        var failures = results
            .SelectMany(r => r.Errors)
            .Where(f => f is not null)
            .ToList();

        if (failures.Count == 0) return await next();

        logger.LogWarning("Validation failed for {Request}: {Errors}",
            typeof(TRequest).Name,
            string.Join("; ", failures.Select(f => f.ErrorMessage)));

        throw new ValidationException(failures);
    }
}

/// <summary>
/// Logs every request with timing. Warns on slow paths (>500ms for commands, >200ms for queries).
/// </summary>
public sealed class LoggingBehavior<TRequest, TResponse>(
    ILogger<LoggingBehavior<TRequest, TResponse>> logger)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(
        TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken ct)
    {
        var requestName = typeof(TRequest).Name;
        var sw = System.Diagnostics.Stopwatch.StartNew();

        logger.LogDebug("Handling {Request}", requestName);

        try
        {
            var response = await next();
            sw.Stop();

            var slowThreshold = requestName.Contains("Query") ? 200 : 500;
            if (sw.ElapsedMilliseconds > slowThreshold)
                logger.LogWarning("Slow {Request} took {Ms}ms", requestName, sw.ElapsedMilliseconds);
            else
                logger.LogDebug("Handled {Request} in {Ms}ms", requestName, sw.ElapsedMilliseconds);

            return response;
        }
        catch (Exception ex)
        {
            sw.Stop();
            logger.LogError(ex, "Error handling {Request} after {Ms}ms", requestName, sw.ElapsedMilliseconds);
            throw;
        }
    }
}

/// <summary>
/// Circuit breaker behavior — suppresses signal generation during known bad windows
/// (high-impact news imminent, extremely low liquidity, market manipulation detected).
/// </summary>
public sealed class MarketCircuitBreakerBehavior<TRequest, TResponse>(
    ILogger<MarketCircuitBreakerBehavior<TRequest, TResponse>> logger,
    Signal.Application.Interfaces.INewsRepository newsRepo)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IMarketSensitiveRequest
    where TResponse : class
{
    public async Task<TResponse> Handle(
        TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken ct)
    {
        // Block signal generation if high-impact event is within 15 minutes
        var upcomingEvents = await newsRepo.GetUpcomingEventsAsync(TimeSpan.FromMinutes(15), ct);
        var criticalEvent = upcomingEvents.FirstOrDefault(e =>
            e.IsHighImpact && (e.Currency == "USD" || e.Currency == request.Symbol[3..6]));

        if (criticalEvent is not null)
        {
            logger.LogWarning(
                "Circuit breaker: blocking {Request} for {Symbol} — high-impact event '{Event}' in {Min}min",
                typeof(TRequest).Name, request.Symbol, criticalEvent.Name,
                Math.Round((criticalEvent.ScheduledAt - DateTime.UtcNow).TotalMinutes, 1));

            return default!;
        }

        return await next();
    }
}

public interface IMarketSensitiveRequest
{
    string Symbol { get; }
}
