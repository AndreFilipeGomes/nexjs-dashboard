"use server";
import { z } from "zod";
import { db } from "@vercel/postgres";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// We are uing a type validation library to validate form data
// before using it for storing on the database
const FormSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  amount: z.coerce.number(),
  status: z.enum(["pending", "paid"]),
  date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });

export async function createInvoice(formData: FormData) {
  const { amount, customerId, status } = CreateInvoice.parse(
    //get data from form
    Object.fromEntries(formData.entries())
  );

  // Good practice to store monetary values in cents in your database
  // to eliminate JavaScript floating-point errors
  const amountInCents = amount * 100;

  const date = new Date().toISOString().split("T")[0];

  // Connect to database since we are using supabase
  // (better explanation in app/lib/data.ts)
  const client = await db.connect();

  try {
    await client.sql`
    INSERT INTO invoices (customer_id, amount, status, date)
    VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
  `;
  } catch (err) {
    console.log("createInvoice err", err);
    return {
      message: "Database Error: Failed to Create Invoice.",
    };
  }

  // Clear invoice chached data and trigger new request
  revalidatePath("/dashboard/invoices");
  // Once revalidated we can redirect to desired page
  redirect("/dashboard/invoices");
}

export async function updateInvoice(id: string, formData: FormData) {
  const { amount, customerId, status } = CreateInvoice.parse(
    Object.fromEntries(formData.entries())
  );

  const client = await db.connect();

  const amountInCents = amount * 100;

  try {
    await client.sql`
    UPDATE invoices
    SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
    WHERE id = ${id}
  `;
  } catch (err) {
    console.log("updateInvoice err", err);
    return { message: "Database Error: Failed to Update Invoice." };
  }

  revalidatePath("/dashboard/invoices");
  redirect("/dashboard/invoices");
}

export async function deleteInvoice(id: string) {
  const client = await db.connect();

  try {
    await client.sql`
    DELETE FROM invoices
    WHERE id = ${id}
  `;

    // We only need to call realidate because this
    // action is done inside invoice page
    // meaning we just need to clear cache and
    // refetch data, no redirection needed
    revalidatePath("/dashboard/invoices");

    return { message: "Deleted Invoice." };
  } catch (err) {
    console.log("deleteInvoice err", err);
    return { message: "Database Error: Failed to Delete Invoice." };
  }
}
