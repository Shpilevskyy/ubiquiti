import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider, defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { LandingPage } from './pages/LandingPage';
import { ListPage } from './pages/ListPage';
import { UpdatePrompt } from './components/UpdatePrompt';

const queryClient = new QueryClient();

// So a cold reload while offline can render the last-seen list contents, not just the app shell
// (tasks/13, piece 2 — piece 1 made the shell itself precache). localStorage over IndexedDB:
// list/todo JSON is well within its ~5MB limit, and it needs no extra dependency — IndexedDB
// (already used for the outbox queue) would only earn its complexity at a size this app doesn't
// reach. `createAsyncStoragePersister` (not the sync-specific one, which is now deprecated in
// favor of this — it accepts any storage, sync or async, uniformly) still gets a synchronous
// `localStorage` under the hood; the "async" in the name is about the persister's own interface,
// not a requirement on the storage it wraps.
const persister = createAsyncStoragePersister({ storage: window.localStorage });

// Only the two query shapes ListPage/LandingPage actually read (['list', id] and ['lists']) —
// nothing else in this app is worth surviving a reload. Still requires TanStack's own default
// (query succeeded, or is pending with a promise) on top of the key filter, so a query that's
// currently loading or errored doesn't get persisted with no usable data.
function shouldPersist(query: Query) {
  return (query.queryKey[0] === 'list' || query.queryKey[0] === 'lists') && defaultShouldDehydrateQuery(query);
}

persistQueryClient({
  queryClient,
  persister,
  dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/list/:listId" element={<ListPage />} />
        </Routes>
      </BrowserRouter>
      <UpdatePrompt />
    </QueryClientProvider>
  );
}
