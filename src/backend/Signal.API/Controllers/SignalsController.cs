using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Signal.Application.Commands;
using Signal.Application.DTOs;
using Signal.Application.Queries;
using System.ComponentModel.DataAnnotations;

namespace Signal.API.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
[Produces("application/json")]
public sealed class SignalsController(IMediator mediator, ILogger<SignalsController> logger)
    : ControllerBase
{
    /// <summary>Get all currently active institutional-grade signals.</summary>
    [HttpGet("active")]
    [AllowAnonymous]
    [ProducesResponseType<IReadOnlyList<SignalDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetActive(
        [FromQuery] string? symbol = null,
        CancellationToken ct = default)
    {
        var result = await mediator.Send(new GetActiveSignalsQuery(symbol), ct);
        return Ok(result);
    }

    /// <summary>Get paginated signal history for a symbol.</summary>
    [HttpGet("history/{symbol}")]
    [ProducesResponseType<PagedResult<SignalDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetHistory(
        [FromRoute] string symbol,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        [FromQuery][Range(1, 100)] int page = 1,
        [FromQuery][Range(1, 100)] int pageSize = 20,
        CancellationToken ct = default)
    {
        var result = await mediator.Send(new GetSignalHistoryQuery(
            symbol.ToUpperInvariant(),
            from ?? DateTime.UtcNow.AddDays(-7),
            to ?? DateTime.UtcNow,
            page, pageSize), ct);
        return Ok(result);
    }

    /// <summary>Manually trigger signal analysis for a symbol (used by admin/backtest flows).</summary>
    [HttpPost("analyze")]
    [Authorize(Roles = "Admin,Analyst")]
    [ProducesResponseType<SignalDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Analyze(
        [FromBody] AnalyzeRequest request,
        CancellationToken ct = default)
    {
        var result = await mediator.Send(
            new GenerateSignalCommand(request.Symbol.ToUpperInvariant(), request.Force), ct);

        if (result is null)
        {
            logger.LogInformation("No trade signal for {Symbol}", request.Symbol);
            return NoContent();
        }

        return Ok(result);
    }

    /// <summary>Market overview for the dashboard ticker bar.</summary>
    [HttpGet("overview")]
    [AllowAnonymous]
    [ProducesResponseType<IReadOnlyList<MarketOverviewDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetOverview(CancellationToken ct = default)
    {
        var symbols = new[] { "XAUUSD", "EURUSD", "GBPUSD", "US30", "NAS100", "BTCUSD" };
        var result = await mediator.Send(new GetMarketOverviewQuery(symbols), ct);
        return Ok(result);
    }

    public record AnalyzeRequest(
        [Required] string Symbol,
        bool Force = false);
}
