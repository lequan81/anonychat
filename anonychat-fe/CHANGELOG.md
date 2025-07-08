# Changelog

All notable changes to the AnonyChat Frontend will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2025-07-08

### Added

- **Message Timestamps**: Added 24-hour format timestamps (HH:mm) to all message bubbles
- **Improved Message UI**: Enhanced message bubble design with proper timestamp positioning
- **Environment Configuration**: All timing and UI values moved to environment variables
- **Component Structure Cleanup**: Removed redundant files and improved organization

### Changed

- **Message Bubble Layout**: Timestamps now appear as tiny text at bottom of bubbles
- **Timestamp Format**: Changed from 12-hour (AM/PM) to 24-hour format
- **File Organization**: Cleaned up duplicate header components and router files
- **Environment Variables**: All hardcoded values moved to `.env` for better configuration

### Fixed

- **Router Export Issues**: Fixed import/export problems with router components
- **Font Preload Warning**: Corrected font preload type from `font/ttf` to `font/woff2`
- **Component Redundancy**: Removed duplicate `ChatHeader.jsx` and unnecessary barrel files

### Technical Details

- Added `formatMessageTime()` utility function for 24-hour timestamp formatting
- Enhanced `MessageBubble` component with timestamp display
- Updated `MessageRenderer` to pass timestamp props
- Cleaned up router structure by removing redundant `AppRouter.jsx` and barrel files
- Removed duplicate header components (`ChatHeader.jsx`, `index.js`)

### Environment Variables Added

- `VITE_TOAST_DURATION`: Toast message duration (default: 3000ms)
- `VITE_TYPING_TIMEOUT`: Typing indicator timeout (default: 2000ms)
- `VITE_RECONNECT_DELAY`: Reconnection delay (default: 2000ms)
- `VITE_MIN_CONNECTION_DURATION`: Minimum connection duration (default: 5000ms)
- `VITE_MAX_RECONNECT_DELAY`: Maximum reconnection delay (default: 10000ms)
- `VITE_RECONNECT_JITTER`: Reconnection jitter (default: 1200ms)
- `VITE_APP_NAME`: Application name (default: "AnonyChat")
- `VITE_APP_VERSION`: Application version (default: "1.0.0")
- `VITE_COPYRIGHT_YEAR`: Copyright year (default: 2025)
- `VITE_PRELOAD_DELAY`: Component preload delay (default: 50ms)

## [1.2.0] - 2025-07-07

### Added

- **React Router**: Added client-side routing for multiple pages
- **Lazy Loading**: Implemented lazy loading for better performance
- **New Pages**: Added About and Policy pages with proper navigation
- **Error Boundaries**: Enhanced error handling with error boundary components
- **Code Splitting**: Optimized bundle splitting for better caching

### Changed

- **Component Architecture**: Refactored to modular, type-based organization
- **Navigation Structure**: Moved navigation from footer to header
- **Build Optimization**: Enhanced Vite configuration for better performance
- **Import System**: Implemented path aliases for cleaner imports

### Fixed

- **Component Imports**: Fixed all import paths after restructuring
- **Bundle Optimization**: Improved build output and chunk splitting
- **UI Layout**: Fixed centering and layout issues for status indicators

### Technical Details

- Restructured components into logical folders (chat, layout, ui, status, etc.)
- Added `@` alias for cleaner import paths
- Implemented React.lazy() for page components
- Enhanced Vite build configuration with manual chunk splitting

## [1.1.0] - 2025-07-06

### Added

- **Virtualized Chat**: High-performance chat rendering for large message histories
- **Message Management**: Advanced message state management and optimization
- **Real-time Features**: Enhanced typing indicators and connection status
- **Audio Notifications**: Sound alerts for new messages and activities
- **Responsive Design**: Mobile-optimized UI with touch-friendly interactions

### Changed

- **Component Modularization**: Split large components into smaller, focused modules
- **State Management**: Improved state handling for chat and connection states
- **UI/UX Improvements**: Enhanced visual design and user experience
- **Performance**: Optimized rendering and reduced unnecessary re-renders

### Fixed

- **WebSocket Reliability**: Improved connection stability and reconnection logic
- **Memory Management**: Fixed memory leaks in message handling
- **Mobile Experience**: Resolved touch and scrolling issues on mobile devices

### Technical Details

- Created `VirtualizedChatLog` for handling large message lists
- Separated `StandardChatLog` for smaller conversations
- Added `MessageRenderer` for optimized message display
- Enhanced WebSocket hook with better state management

## [1.0.0] - 2025-07-05

### Added

- **Core Chat Interface**: Real-time anonymous chat application
- **WebSocket Integration**: Bidirectional communication with backend
- **Message System**: Send/receive text messages with delivery receipts
- **Connection Management**: Automatic connection handling and reconnection
- **Status Indicators**: Live connection status and online user count
- **Typing Indicators**: Real-time typing status display
- **Responsive UI**: Mobile-first design with Tailwind CSS
- **Error Handling**: Comprehensive error boundary and user feedback
- **Loading States**: Smooth loading indicators and transitions

### Technical Features

- React 18 with modern hooks and patterns
- Vite build system for fast development
- Tailwind CSS for utility-first styling
- Custom WebSocket hook for connection management
- Context-based state management
- Component-based architecture
- ESLint and Prettier for code quality
- Path aliasing for clean imports

### UI Components

- **ChatContainer**: Main chat interface layout
- **ChatLog**: Message history display
- **MessageInput**: Text input with send functionality
- **MessageBubble**: Individual message display
- **OnlineCounter**: Live user count display
- **StatusBadge**: Connection status indicator
- **TypingIndicator**: Real-time typing status
- **Toast**: User notification system
- **Loader**: Loading state components

### Styling & Design

- Dark theme with purple accent colors
- Glassmorphism effects and modern gradients
- Smooth animations and transitions
- Mobile-responsive design
- Touch-friendly interface
- Accessible color contrast
- Custom scrollbars and focus states
