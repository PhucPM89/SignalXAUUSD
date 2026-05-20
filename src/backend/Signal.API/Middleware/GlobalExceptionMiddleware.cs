using System.Net;
using System.Text.Json;

namespace Signal.API.Middleware;

public sealed class GlobalExceptionMiddleware(
    RequestDelegate next,
    ILogger<GlobalExceptionMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext ctx)
    {
        try
        {
            await next(ctx);
        }
        catch (FluentValidation.ValidationException ex)
        {
            ctx.Response.StatusCode = (int)HttpStatusCode.BadRequest;
            ctx.Response.ContentType = "application/json";
            await ctx.Response.WriteAsync(JsonSerializer.Serialize(new
            {
                type = "validation_error",
                errors = ex.Errors.Select(e => new { field = e.PropertyName, message = e.ErrorMessage })
            }));
        }
        catch (UnauthorizedAccessException)
        {
            ctx.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unhandled exception for {Method} {Path}",
                ctx.Request.Method, ctx.Request.Path);

            ctx.Response.StatusCode = (int)HttpStatusCode.InternalServerError;
            ctx.Response.ContentType = "application/json";

            // Never leak exception details in production
            var message = ctx.RequestServices.GetRequiredService<IHostEnvironment>().IsDevelopment()
                ? ex.Message
                : "An internal server error occurred.";

            await ctx.Response.WriteAsync(JsonSerializer.Serialize(new { type = "server_error", message }));
        }
    }
}

public sealed class RequestTimingMiddleware(RequestDelegate next, ILogger<RequestTimingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext ctx)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        await next(ctx);
        sw.Stop();

        if (!ctx.Response.HasStarted)
            ctx.Response.Headers["X-Response-Time"] = $"{sw.ElapsedMilliseconds}ms";

        if (sw.ElapsedMilliseconds > 500)
            logger.LogWarning("Slow request: {Method} {Path} took {Ms}ms",
                ctx.Request.Method, ctx.Request.Path, sw.ElapsedMilliseconds);
    }
}
