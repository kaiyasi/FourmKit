import { Navigate } from "react-router-dom";
import { isLoggedIn, getRole, Role } from "@/utils/auth";

export function RequireAuth({ children }: { children: JSX.Element }) {
  if (!isLoggedIn()) return <Navigate to="/auth" replace />;
  return children;
}

export function RequireRoles({ allow, children }: { allow: Role[]; children: JSX.Element }) {
  if (!isLoggedIn()) return <Navigate to="/auth" replace />;
  const role = getRole(); 
  if (!allow.includes(role)) return <Navigate to="/403" replace />;
  return children;
}
