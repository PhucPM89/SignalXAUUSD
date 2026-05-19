FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Restore — separate layer for cache efficiency
COPY ["Signal.API/Signal.API.csproj", "Signal.API/"]
COPY ["Signal.Application/Signal.Application.csproj", "Signal.Application/"]
COPY ["Signal.Domain/Signal.Domain.csproj", "Signal.Domain/"]
COPY ["Signal.Infrastructure/Signal.Infrastructure.csproj", "Signal.Infrastructure/"]
RUN dotnet restore "Signal.API/Signal.API.csproj"

# Build
COPY . .
RUN dotnet publish "Signal.API/Signal.API.csproj" \
    -c Release \
    -o /app/publish \
    --no-restore \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Security: run as non-root
RUN addgroup --system --gid 1001 signal && \
    adduser --system --uid 1001 --ingroup signal signal

COPY --from=build --chown=signal:signal /app/publish .
USER signal

EXPOSE 8080
ENTRYPOINT ["dotnet", "Signal.API.dll"]
