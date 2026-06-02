import React from "react";
import { useAuth } from "../../hooks/useAuth.js";
import { LoginPage } from "./LoginPage.jsx";
import { AdminDashboard } from "./AdminDashboard.jsx";
import { LoadingScreen } from "../../components/LoadingScreen.jsx";

export function AdminApp() {
  const { session, loading, signIn, signOut } = useAuth();

  if (loading)    return <LoadingScreen visible />;
  if (!session)   return <LoginPage onSignIn={signIn} />;
  return <AdminDashboard onSignOut={signOut} />;
}
