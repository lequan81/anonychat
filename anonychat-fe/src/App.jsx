import AppRouter from '@components/router';
import { ErrorBoundary } from '@components/layout';

function App() {
  return (
    <ErrorBoundary>
      <AppRouter />
    </ErrorBoundary>
  );
}

export default App;
