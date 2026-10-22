import { useState } from "react";
import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useOutletContext, useParams } from "react-router-dom";
import { useSession } from "./hooks/useSession";
import { useCategories } from "./hooks/useCategories";
import { useTransactions } from "./hooks/useTransactions";
import { useSpending } from "./hooks/useSpending";
import { usePaymentFlows } from "./hooks/usePaymentFlows";
import { usePaymentModes } from "./hooks/usePaymentModes";
import type { Family, PaymentMode } from "./types";
import { APPEARANCE_PATH, DEFAULT_PATH, useBackgroundLocation } from "./hooks/useAppearanceRoute";
import Dashboard from "./components/Dashboard";
import TransactionInput from "./components/TransactionInput";
import TransactionList from "./components/TransactionList";
import TransactionDetail from "./components/TransactionDetail";
import { supabase } from "./lib/supabase";
import AuthScreen from "./components/AuthScreen";
import SetNewPassword from "./components/SetNewPassword";
import CategoryInput from "./components/CategoryInput";
import CategoryList from "./components/CategoryList";
import FamilyPage from "./components/FamilyPage";
import { useGlobalSearch } from "./hooks/useSearch";

type HomeContext = {
  userId: string;
  email?: string;
  families: Family[];
  selectedFamilyId: string | null;
  setSelectedFamilyId: (familyId: string | null) => void;
  categories: ReturnType<typeof useCategories>;
  txns: ReturnType<typeof useTransactions>;
  paymentModes: PaymentMode[];
  setReviewing: (reviewing: boolean) => void;
  reviewing: boolean;
  search: ReturnType<typeof useGlobalSearch>;
};

const useHome = () => useOutletContext<HomeContext>();

const TABS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/transactions", label: "Transactions" },
  { to: "/categories", label: "Categories" },
  { to: "/family", label: "Family" },
];

/** Shared layout: header, section tabs and the data the section pages use. */
function Home({ userId, email, families, selectedFamilyId, setSelectedFamilyId }: { userId: string; email?: string; families: Family[]; selectedFamilyId: string | null; setSelectedFamilyId: (familyId: string | null) => void }) {
  const categories = useCategories(userId);
  const txns = useTransactions(userId);
  const paymentModes = usePaymentModes(userId);
  const [reviewing, setReviewing] = useState(false);
  const search = useGlobalSearch();

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

      {families.length > 0 && (
        <div className="card family-switcher">
          <label>
            Family
            <select value={selectedFamilyId ?? ""} onChange={(e) => setSelectedFamilyId(e.target.value || null)}>
              {families.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

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
      <Outlet context={{ userId, email, families, selectedFamilyId, setSelectedFamilyId, categories, txns, paymentModes, reviewing, setReviewing, search } satisfies HomeContext} />
    </main>
  );
}

function DashboardPage() {
  const { userId, paymentModes } = useHome();
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
  const { categories, txns, paymentModes, reviewing, setReviewing, selectedFamilyId, families, search } = useHome();
  const familyMembers = selectedFamilyId ? families.filter((f) => f.id === selectedFamilyId).length : 0;
  return (
    <>
      <TransactionInput
        categories={categories.categories}
        paymentModes={paymentModes}
        familyId={selectedFamilyId}
        familyMembers={[]}
        onReviewChange={setReviewing}
        onSaved={async () => {
          await Promise.all([txns.refresh(), categories.reload()]);
        }}
      />
      {!reviewing && (
        <TransactionList
          transactions={txns.transactions}
          paymentModes={paymentModes}
          loading={txns.loading}
          onDelete={txns.remove}
          search={search}
        />
      )}
      {familyMembers === 0 && selectedFamilyId && <p className="hint">This family is selected, but no family members were loaded yet.</p>}
    </>
  );
}

function TransactionDetailPage() {
  const { transactionId } = useParams();
  const { paymentModes } = useHome();
  if (!transactionId) return <Navigate to="/transactions" replace />;
  return <TransactionDetail transactionId={transactionId} paymentModes={paymentModes} />;
}

function CategoriesPage() {
  const { categories, txns, search } = useHome();
  return (
    <>
      <CategoryInput existing={categories.categories.map((c) => c.name)} onSave={categories.addMany} />
      <CategoryList
        categories={categories.categories}
        loading={categories.loading}
        onRename={categories.rename}
        onDelete={async (id) => {
          await categories.remove(id);
          await txns.refresh();
        }}
        search={search}
      />
    </>
  );
}

function AppRoutes({ userId, email, families, selectedFamilyId, setSelectedFamilyId, refreshFamilies }: { userId: string; email?: string; families: Family[]; selectedFamilyId: string | null; setSelectedFamilyId: (familyId: string | null) => void; refreshFamilies: () => Promise<void> | void; }) {
  const location = useLocation();
  const background = useBackgroundLocation();
  const pageLocation = location.pathname === APPEARANCE_PATH ? (background ?? { pathname: DEFAULT_PATH }) : location;

  return (
    <Routes location={pageLocation}>
      <Route element={<Home userId={userId} email={email} families={families} selectedFamilyId={selectedFamilyId} setSelectedFamilyId={setSelectedFamilyId} />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/transactions/:transactionId" element={<TransactionDetailPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/family" element={<FamilyPage userId={userId} email={email ?? ""} families={families} selectedFamilyId={selectedFamilyId} setSelectedFamilyId={setSelectedFamilyId} onRefreshFamilies={refreshFamilies} />} />
      </Route>
      <Route path="*" element={<Navigate to={DEFAULT_PATH} replace />} />
    </Routes>
  );
}

export default function App() {
  const { session, loading, recovery, finishRecovery, families, selectedFamilyId, setSelectedFamilyId, refreshFamilies } = useSession();
  if (loading) return <main className="page"><p className="hint">Loading...</p></main>;
  if (!session) return <AuthScreen />;
  if (recovery) return <SetNewPassword onDone={finishRecovery} />;
  return <AppRoutes userId={session.user.id} email={session.user.email} families={families} selectedFamilyId={selectedFamilyId} setSelectedFamilyId={setSelectedFamilyId} refreshFamilies={refreshFamilies} />;
}
