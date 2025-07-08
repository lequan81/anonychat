import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { Loader } from '@components/ui';

// Lazy load pages
const Home = lazy(() => import('@pages/Home'));
const About = lazy(() => import('@pages/About'));
const Policy = lazy(() => import('@pages/Policy'));
const Error = lazy(() => import('@pages/Error'));

function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route
            path="/"
            element={<Home />}
          />
          <Route
            path="/about"
            element={<About />}
          />
          <Route
            path="/policy"
            element={<Policy />}
          />
          <Route
            path="/error"
            element={<Error />}
          />
          <Route
            path="*"
            element={<Error />}
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default AppRouter;
