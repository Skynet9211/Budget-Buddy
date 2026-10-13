import { useState } from "react";
import { useSession } from "./hooks/useSession";
import { useCategories } from "./hooks/useCategories";
import { useTransactions } from "./hooks/useTransactions";
import { useSpending } from "./hooks/useSpending";
import Dashboard from "./components/Dashboard";
import TransactionInput from "./components/TransactionInput";
import TransactionList from "./components/TransactionList";
import { supabase } from "./lib/supabase";
import AuthScreen from "./components/AuthScreen";
import SetNewPassword from "./components/SetNewPassword";
import CategoryInput from "./components/CategoryInput";
import CategoryList from "./components/CategoryList";

function Home({ userId, email }: { userId: string; email?: string }) {
  const { categories, loading, error, addMany, rename, remove, reload } = useCategories(userId);
  const txns = useTransactions(userId);
  const [tab, setTab] = useState<"dashboard" | "transactions" | "categories">("dashboard");
  const spending = useSpending(userId, tab === "dashboard");
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
          <button className={tab === "dashboard" ? "on" : ""} onClick={() => setTab("dashboard")}>
            Dashboard
          </button>
          <button className={tab === "transactions" ? "on" : ""} onClick={() => setTab("transactions")}>
            Transactions
          </button>
          <button className={tab === "categories" ? "on" : ""} onClick={() => setTab("categories")}>
            Categories
          </button>
        </nav>
      )}
      {error && <p className="error">{error}</p>}
      {txns.error && <p className="error">{txns.error}</p>}
      {tab === "dashboard" ? (
        <>
          {spending.error && <p className="error">{spending.error}</p>}
          <Dashboard expenses={spending.expenses} loading={spending.loading} />
        </>
      ) : tab === "transactions" ? (
        <>
          <TransactionInput
            categories={categories}
            onReviewChange={setReviewing}
            onSaved={async () => {
              // A transaction can create a new category, so refresh both lists.
              await Promise.all([txns.refresh(), reload()]);
            }}
          />
          {!reviewing && (
            <TransactionList transactions={txns.transactions} loading={txns.loading} onDelete={txns.remove} />
          )}
        </>
      ) : (
        <>
          <CategoryInput existing={categories.map((c) => c.name)} onSave={addMany} />
          <CategoryList
            categories={categories}
            loading={loading}
            onRename={rename}
            onDelete={async (id) => {
              await remove(id);
              await txns.refresh(); // transactions in a deleted category become uncategorised
            }}
          />
        </>
      )}
    </main>
  );
}

export default function App() {
  const { session, loading, recovery, finishRecovery } = useSession();
  if (loading) return <main className="page"><p className="hint">Loading...</p></main>;
  if (!session) return <AuthScreen />;
  if (recovery) return <SetNewPassword onDone={finishRecovery} />;
  return <Home userId={session.user.id} email={session.user.email} />;
}
