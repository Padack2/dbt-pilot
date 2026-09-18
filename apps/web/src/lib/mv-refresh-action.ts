"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { runMvRefresh } from "./mv-refresh-runner";

export async function triggerMvRefresh() {
  const result = await runMvRefresh();

  if (result.status === "success" || result.status === "error") {
    revalidatePath("/models");
  }

  redirect(`/models?refresh=${result.status}`);
}
