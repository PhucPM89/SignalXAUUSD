namespace Signal.Domain.ValueObjects;

public sealed record Price
{
    public decimal Value { get; }
    public int Decimals { get; }

    private Price(decimal value, int decimals)
    {
        Value = value;
        Decimals = decimals;
    }

    public static Price Of(decimal value, int decimals = 5) =>
        value <= 0
            ? throw new ArgumentException($"Price must be positive. Got: {value}")
            : new Price(Math.Round(value, decimals), decimals);

    public static Price? TryCreate(decimal value, int decimals = 5) =>
        value > 0 ? new Price(Math.Round(value, decimals), decimals) : null;

    public decimal PipValue(decimal pipSize = 0.0001m) => Value / pipSize;

    public decimal DistancePips(Price other, decimal pipSize = 0.0001m) =>
        Math.Abs(Value - other.Value) / pipSize;

    public static implicit operator decimal(Price price) => price.Value;
    public override string ToString() => Value.ToString($"F{Decimals}");
}
