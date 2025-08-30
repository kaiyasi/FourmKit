import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getRole, Role } from "@/utils/auth";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuth();
  if (!isLoggedIn) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

export function RequireRoles({ children, allow }: { children: React.ReactNode; allow: Role[] }) {
  const { isLoggedIn, role } = useAuth();
  if (!isLoggedIn) return <Navigate to="/auth" replace />;
  if (!role || !allow.includes(role as Role)) return <Navigate to="/403" replace />;
  return <>{children}</>;
}
