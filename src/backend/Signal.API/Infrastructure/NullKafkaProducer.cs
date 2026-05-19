using Confluent.Kafka;

namespace Signal.API.Infrastructure;

// No-op Kafka producer used when KAFKA_ENABLED=false (cloud deploys without Kafka).
// Signals are still broadcast via SignalR; Kafka is skipped silently.
public sealed class NullKafkaProducer : IProducer<string, string>
{
    public Handle Handle => throw new NotSupportedException("Null producer has no handle.");
    public string Name => "NullProducer";

    public void AbortTransaction(TimeSpan timeout) { }
    public void AbortTransaction() { }
    public void BeginTransaction() { }
    public void CommitTransaction(TimeSpan timeout) { }
    public void CommitTransaction() { }
    public void Flush(CancellationToken cancellationToken = default) { }
    public int Flush(TimeSpan timeout) => 0;
    public void InitTransactions(TimeSpan timeout) { }
    public int Poll(TimeSpan timeout) => 0;

    public void Produce(string topic, Message<string, string> message,
        Action<DeliveryReport<string, string>>? deliveryHandler = null) { }

    public void Produce(TopicPartition topicPartition, Message<string, string> message,
        Action<DeliveryReport<string, string>>? deliveryHandler = null) { }

    public Task<DeliveryResult<string, string>> ProduceAsync(
        string topic, Message<string, string> message, CancellationToken cancellationToken = default)
        => Task.FromResult(new DeliveryResult<string, string>
        {
            Status = PersistenceStatus.NotPersisted,
            Topic = topic,
            Message = message
        });

    public Task<DeliveryResult<string, string>> ProduceAsync(
        TopicPartition topicPartition, Message<string, string> message, CancellationToken cancellationToken = default)
        => Task.FromResult(new DeliveryResult<string, string>
        {
            Status = PersistenceStatus.NotPersisted,
            Topic = topicPartition.Topic,
            Message = message
        });

    public void SendOffsetsToTransaction(IEnumerable<TopicPartitionOffset> offsets,
        IConsumerGroupMetadata groupMetadata, TimeSpan timeout) { }

    public int AddBrokers(string brokers) => 0;
    public void SetSaslCredentials(string username, string password) { }

    public void Dispose() { }
}
