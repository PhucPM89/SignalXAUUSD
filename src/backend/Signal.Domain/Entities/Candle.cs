using Signal.Domain.Enums;

namespace Signal.Domain.Entities;

public sealed class Candle
{
    public Guid Id { get; private set; } = Guid.NewGuid();
    public string Symbol { get; private set; } = default!;
    public Timeframe Timeframe { get; private set; }
    public DateTime OpenTime { get; private set; }
    public DateTime CloseTime { get; private set; }
    public decimal Open { get; private set; }
    public decimal High { get; private set; }
    public decimal Low { get; private set; }
    public decimal Close { get; private set; }
    public decimal Volume { get; private set; }
    public bool IsBullish => Close >= Open;
    public bool IsBearish => Close < Open;
    public decimal Body => Math.Abs(Close - Open);
    public decimal UpperWick => High - Math.Max(Open, Close);
    public decimal LowerWick => Math.Min(Open, Close) - Low;
    public decimal Range => High - Low;
    public bool IsEngulfing(Candle previous) =>
        IsBullish && !previous.IsBullish && Open < previous.Close && Close > previous.Open;
    public bool IsPinBar(decimal wickRatio = 0.66m) =>
        LowerWick > Range * wickRatio || UpperWick > Range * wickRatio;
    public bool IsInsideBar(Candle parent) =>
        High <= parent.High && Low >= parent.Low;

    public static Candle Create(
        string symbol, Timeframe tf, DateTime openTime,
        decimal open, decimal high, decimal low, decimal close, decimal volume)
    {
        if (high < low) throw new ArgumentException("High must be >= Low.");
        if (high < open || high < close) throw new ArgumentException("High must be >= Open and Close.");
        if (low > open || low > close) throw new ArgumentException("Low must be <= Open and Close.");

        return new Candle
        {
            Symbol = symbol,
            Timeframe = tf,
            OpenTime = openTime,
            CloseTime = openTime.AddMinutes((int)tf),
            Open = open,
            High = high,
            Low = low,
            Close = close,
            Volume = volume
        };
    }
}
