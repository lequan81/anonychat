# Changelog

All notable changes to the AnonyChat Backend will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2025-07-08

### Added

- **Inactive Pair Cleanup**: Automatically disconnect pairs that haven't sent messages for over 2 days
- **30-Second No Partner Timeout**: Show "No partner available" message if no partner is found within 30 seconds
- **Environment Variable Configuration**: All timing and configuration values moved to `.env` for better maintainability
- **Enhanced Logging**: Added logging for inactive pair cleanup and no partner timeout events
- **Logger Configuration**: Log file sizes, rotation, and intervals now configurable via environment variables

### Changed

- **Improved Pairing Logic**: Enhanced pair matching with better cooldown mechanisms
- **Enhanced Connection Management**: Better handling of connection states and cleanup
- **Performance Optimization**: Periodic cleanup of inactive connections and pairs
- **Environment-Based Configuration**: All hardcoded values moved to environment variables

### Fixed

- **Connection Cleanup**: Fixed issues with orphaned connections in waiting queue
- **Timeout Management**: Proper clearing of timeouts when users pair or disconnect
- **Memory Management**: Better cleanup of inactive connections to prevent memory leaks

### Technical Details

- Added `cleanupInactivePairs()` function with 2-day inactivity timeout
- Implemented `startNoPartnerTimeout()` and `clearAllNoPartnerTimeouts()` functions
- Enhanced logger with `inactivePairCleanup()` and `noPartnerTimeout()` methods
- Added comprehensive environment variable support for all timing configurations
- Improved error handling and connection state management

### Environment Variables Added

- `NO_PARTNER_TIMEOUT`: Time to wait before showing "no partner available" (default: 30s)
- `INACTIVE_PAIR_TIMEOUT`: Time before disconnecting inactive pairs (default: 2 days)
- `WS_CLOSE_CODE_THROTTLE`: WebSocket close code for throttling (default: 4000)
- `WS_CLOSE_CODE_NORMAL`: WebSocket close code for normal closure (default: 1000)
- `INACTIVE_PAIR_CLOSE_DELAY`: Delay before closing inactive pairs (default: 2s)
- `LOG_*`: Various logging configuration variables
- `CLEANUP_INTERVAL`: General cleanup interval (default: 60s)
- `INACTIVE_CLEANUP_INTERVAL`: Inactive pair cleanup interval (default: 30min)
- `STATS_BROADCAST_INTERVAL`: Stats broadcast interval (default: 10s)

## [1.1.0] - 2025-07-07

### Added

- **Structured Logging**: Comprehensive logging system with Winston
- **Heartbeat Mechanism**: Connection health monitoring with ping/pong
- **Connection Throttling**: Rate limiting to prevent abuse
- **Graceful Shutdown**: Proper cleanup on server termination
- **Metrics Tracking**: Real-time statistics and performance monitoring

### Changed

- **Enhanced WebSocket Management**: Improved connection handling and cleanup
- **Better Error Handling**: More robust error reporting and recovery
- **Performance Improvements**: Optimized connection management and resource usage

### Fixed

- **Connection Stability**: Resolved issues with connection drops and reconnection
- **Memory Leaks**: Fixed memory management issues with long-running connections

## [1.0.0] - 2025-07-06

### Added

- **Core Chat Functionality**: Anonymous one-on-one chat between strangers
- **WebSocket Server**: Real-time bidirectional communication
- **User Pairing System**: Automatic matching of waiting users
- **Connection Management**: Robust handling of user connections and disconnections
- **Static File Serving**: Serve frontend assets
- **Security Headers**: Basic security headers for web safety
- **Session Management**: Cookie-based session handling
- **Message Broadcasting**: Real-time message delivery between paired users
- **Online Statistics**: Live user count and pairing statistics
- **Typing Indicators**: Real-time typing status between users

### Technical Features

- Express.js server with WebSocket support
- UUID-based user identification
- Automatic partner pairing algorithm
- Connection state management
- Error handling and logging
- CORS and security middleware
- Environment-based configuration
