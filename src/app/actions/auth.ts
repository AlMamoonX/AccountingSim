"use server";

import { redirect } from "next/navigation";
import { logout, requestCode, verifyCode } from "@/lib/auth";

export async function requestCodeAction(email: string) {
  return requestCode(email);
}

export async function verifyCodeAction(email: string, code: string) {
  return verifyCode(email, code);
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
