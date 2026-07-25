import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminDashboard from "@/components/AdminDashboard";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";

export default async function AdminPage() {
  const cookieStore = await cookies();
  if (!verifyAuthToken(cookieStore.get(AUTH_COOKIE)?.value)) redirect("/admin/login");
  return <AdminDashboard />;
}
