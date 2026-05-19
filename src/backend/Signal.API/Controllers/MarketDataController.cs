using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Signal.Application.DTOs;
using Signal.Application.Queries;
using Signal.Domain.Enums;

namespace Signal.API.Controllers;

[ApiController]
[Route("api/v1/market")]
[Authorize]
[Produces("application/json")]
public sealed class MarketDataController(IMediator mediator) : ControllerBase
{
    /// <summary>Get OHLCV candles for TradingView chart rendering.</summary>
    [HttpGet("candles/{symbol}")]
    [AllowAnonymous]
    [ProducesResponseType<IReadOnlyList<CandleDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCandles(
        [FromRoute] string symbol,
        [FromQuery] string timeframe = "H1",
        [FromQuery] int count = 200,
        CancellationToken ct = default)
    {
        if (!Enum.TryParse<Timeframe>(timeframe, ignoreCase: true, out var tf))
            return BadRequest($"Invalid timeframe: {timeframe}");

        var candles = await mediator.Send(new GetCandlesQuery(symbol.ToUpperInvariant(), tf, count), ct);
        return Ok(candles);
    }
}
