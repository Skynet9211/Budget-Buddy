import { useState } from "react";
import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useOutletContext } from "react-router-dom";
import { useSession } from "./hooks/useSession";
import { useCategories } from "./hooks/useCategories";
import { useTransactions } from "./hooks/useTransactions";
import { useSpending } from "./hooks/useSpending";
import { usePaymentFlows } from "./hooks/usePaymentFlows";
import { usePaymentModes } from "./hooks/usePaymentModes";
import type { PaymentMode } from "./types";
import { APPEARANCE_PATH, DEFAULT_PATH, useBackgroundLocation } from "./hooks/useAppearanceRoute";
import Dashboard from "./components/Dashboard";
import TransactionInput from "./components/TransactionInput";
import TransactionList from "./components/TransactionList";
import { supabase } from "./lib/supabase";
import AuthScreen from "./components/AuthScreen";
import SetNewPassword from "./components/SetNewPassword";
import CategoryInput from "./components/CategoryInput";
import CategoryList from "./components/CategoryList";

type HomeContext = {
  userId: string;
  categories: ReturnType<typeof useCategories>;
  txns: ReturnType<typeof useTransactions>;
  paymentModes: PaymentMode[];
  setReviewing: (reviewing: boolean) => void;
  reviewing: boolean;
};

const useHome = () => useOutletContext<HomeContext>();

const TABS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/transactions", label: "Transactions" },
  { to: "/categories", label: "Categories" },
];

/** Shared layout: header, section tabs and the data the section pages use. */
function Home({ userId, email }: { userId: string; email?: string }) {
  const categories = useCategories(userId);
  const txns = useTransactions(userId);
  const paymentModes = usePaymentModes(userId);
  // True while parsed transactions are waiting to be edited and saved. The lists and tabs are
  // hidden until then, so the user finishes (or cancels) the review first.
  const [reviewing, setReviewing] = useState(false);

  return (
    <main className="page">
      <header className="top">
        <div>
          <h1>Budget Buddy</h1>
          <p className="subtitle">{email}</p>
        </div>
        <button className="btn ghost small" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>
      {!reviewing && (
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? "on" : "")}>
              {t.label}
            </NavLink>
          ))}
        </nav>
      )}
      {categories.error && <p className="error">{categories.error}</p>}
      {txns.error && <p className="error">{txns.error}</p>}
      <Outlet context={{ userId, categories, txns, paymentModes, reviewing, setReviewing } satisfies HomeContext} />
    </main>
  );
}

function DashboardPage() {
  const { userId, paymentModes } = useHome();
  // Mounted only while the Dashboard route is shown, so it reloads each time you return to it.
  const spending = useSpending(userId, true);
  const paymentFlows = usePaymentFlows(userId, true);
  return (
    <>
      {spending.error && <p className="error">{spending.error}</p>}
      {paymentFlows.error && <p className="error">{paymentFlows.error}</p>}
      <Dashboard
        expenses={spending.expenses}
        loading={spending.loading}
        flows={paymentFlows.flows}
        paymentModes={paymentModes}
        flowsLoading={paymentFlows.loading}
      />
    </>
  );
}

function TransactionsPage() {
  const { categories, txns, paymentModes, reviewing, setReviewing } = useHome();
  return (
    <>
      <TransactionInput
        categories={categories.categories}
        paymentModes={paymentModes}
        onReviewChange={setReviewing}
        onSaved={async () => {
          // A transaction can create a new category, so refresh both lists.
          await Promise.all([txns.refresh(), categories.reload()]);
        }}
      />
      {!reviewing && (
        <TransactionList
          transactions={txns.transactions}
          paymentModes={paymentModes}
          loading={txns.loading}
          onDelete={txns.remove}
        />
      )}
    </>
  );
}

function CategoriesPage() {
  const { categories, txns } = useHome();
  return (
    <>
      <CategoryInput existing={categories.categories.map((c) => c.name)} onSave={categories.addMany} />
      <CategoryList
        categories={categories.categories}
        loading={categories.loading}
        onRename={categories.rename}
        onDelete={async (id) => {
          await categories.remove(id);
          await txns.refresh(); // transactions in a deleted category become uncategorised
        }}
      />
    </>
  );
}

function AppRoutes({ userId, email }: { userId: string; email?: string }) {
  const location = useLocation();
  const background = useBackgroundLocation();
  // The Appearance page is drawn over the app, so keep rendering the page underneath it (this keeps
  // an in-progress transaction review intact). Opened directly, fall back to the default page.
  const pageLocation = location.pathname === APPEARANCE_PATH ? (background ?? { pathname: DEFAULT_PATH }) : location;

  return (
    <Routes location={pageLocation}>
      <Route element={<Home userId={userId} email={email} />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
      </Route>
      <Route path="*" element={<Navigate to={DEFAULT_PATH} replace />} />
    </Routes>
  );
}

export default function App() {
  const { session, loading, recovery, finishRecovery } = useSession();
  if (loading) return <main className="page"><p className="hint">Loading...</p></main>;
  if (!session) return <AuthScreen />;
  if (recovery) return <SetNewPassword onDone={finishRecovery} />;
  return <AppRoutes userId={session.user.id} email={session.user.email} />;
}
