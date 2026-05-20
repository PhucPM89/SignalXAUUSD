using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Polly;
using Polly.Extensions.Http;
using Signal.Application.Behaviors;
using Signal.Application.Interfaces;
using Signal.API.Hubs;
using StackExchange.Redis;
using Signal.Infrastructure.Data;
using Signal.Infrastructure.ExternalServices;
using Signal.Infrastructure.Messaging;
using Signal.Infrastructure.Repositories;
using System.Text;

namespace Signal.API.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration config)
    {
        var postgresConn = config.GetConnectionString("Postgres");
        var redisConn = config.GetConnectionString("Redis");

        if (!string.IsNullOrEmpty(postgresConn))
        {
            services.AddDbContext<ApplicationDbContext>(opts =>
                opts.UseNpgsql(postgresConn,
                    npg => npg.MigrationsAssembly("Signal.Infrastructure")
                               .EnableRetryOnFailure(3)));
        }
        else
        {
            services.AddDbContext<ApplicationDbContext>(opts =>
                opts.UseInMemoryDatabase("SignalDb"));
        }

        if (!string.IsNullOrEmpty(redisConn))
        {
            services.AddStackExchangeRedisCache(opts =>
            {
                opts.Configuration = redisConn;
                opts.InstanceName = "Signal:";
            });
        }
        else
        {
            services.AddDistributedMemoryCache();
        }

        // HTTP clients with Polly retry + circuit breaker
        services.AddHttpClient("Polygon", c =>
            c.BaseAddress = new Uri("https://api.polygon.io"))
            .AddPolicyHandler(GetRetryPolicy())
            .AddPolicyHandler(GetCircuitBreakerPolicy());

        services.AddHttpClient("TwelveData", c =>
            c.BaseAddress = new Uri("https://api.twelvedata.com"))
            .AddPolicyHandler(GetRetryPolicy());

        services.AddHttpClient("Yahoo", c =>
        {
            c.BaseAddress = new Uri("https://query1.finance.yahoo.com");
            c.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0");
        }).AddPolicyHandler(GetRetryPolicy());

        services.AddHttpClient("SignalEngine", c =>
        {
            c.BaseAddress = new Uri(config["SignalEngine:BaseUrl"] ?? "http://signal-engine:8000");
            c.Timeout = TimeSpan.FromSeconds(
                config.GetValue("SignalEngine:TimeoutSeconds", 5));
        }).AddPolicyHandler(GetRetryPolicy());

        // Repositories
        services.AddScoped<ISignalRepository, SignalRepository>();
        services.AddScoped<INewsRepository, NewsRepository>();

        // External services
        services.AddScoped<IMarketDataService, MarketDataService>();
        services.AddScoped<ISignalInferenceService, SignalInferenceService>();
        services.AddScoped<INotificationService, SignalEventPublisher>();
        services.AddScoped<ISignalBroadcaster, SignalRBroadcaster>();

        // Options
        services.Configure<MarketDataOptions>(config.GetSection("MarketData"));
        services.Configure<SignalEngineOptions>(config.GetSection("SignalEngine"));

        return services;
    }

    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        var applicationAssembly = typeof(Signal.Application.Commands.GenerateSignalCommand).Assembly;

        services.AddMediatR(cfg =>
        {
            cfg.RegisterServicesFromAssembly(applicationAssembly);
            cfg.AddBehavior(typeof(IPipelineBehavior<,>), typeof(LoggingBehavior<,>));
            cfg.AddBehavior(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));
        });

        services.AddValidatorsFromAssembly(applicationAssembly);
        return services;
    }

    public static IServiceCollection AddJwtAuthentication(
        this IServiceCollection services, IConfiguration config)
    {
        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(opts =>
            {
                opts.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = config["Jwt:Issuer"],
                    ValidAudience = config["Jwt:Audience"],
                    IssuerSigningKey = new SymmetricSecurityKey(
                        Encoding.UTF8.GetBytes(config["Jwt:Key"]!)),
                    ClockSkew = TimeSpan.FromSeconds(30)
                };

                // Support JWT in SignalR query string (WebSocket limitation)
                opts.Events = new JwtBearerEvents
                {
                    OnMessageReceived = ctx =>
                    {
                        var token = ctx.Request.Query["access_token"];
                        if (!string.IsNullOrEmpty(token) &&
                            ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                            ctx.Token = token;
                        return Task.CompletedTask;
                    }
                };
            });

        return services;
    }

    public static IServiceCollection AddSignalRWithRedisBackplane(
        this IServiceCollection services, IConfiguration config)
    {
        var signalR = services.AddSignalR(opts =>
        {
            opts.EnableDetailedErrors = false;
            opts.MaximumReceiveMessageSize = 32 * 1024;
            opts.ClientTimeoutInterval = TimeSpan.FromSeconds(60);
            opts.KeepAliveInterval = TimeSpan.FromSeconds(15);
        });

        var redisConn = config.GetConnectionString("Redis");
        if (!string.IsNullOrEmpty(redisConn))
        {
            signalR.AddStackExchangeRedis(redisConn,
                opts => opts.Configuration.ChannelPrefix = RedisChannel.Literal("Signal:Hub"));
        }

        return services;
    }

    private static IAsyncPolicy<HttpResponseMessage> GetRetryPolicy() =>
        HttpPolicyExtensions
            .HandleTransientHttpError()
            .WaitAndRetryAsync(3, attempt => TimeSpan.FromMilliseconds(200 * Math.Pow(2, attempt)));

    private static IAsyncPolicy<HttpResponseMessage> GetCircuitBreakerPolicy() =>
        HttpPolicyExtensions
            .HandleTransientHttpError()
            .CircuitBreakerAsync(5, TimeSpan.FromSeconds(30));
}
