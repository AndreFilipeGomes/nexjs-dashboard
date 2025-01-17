"use server";
import { z } from "zod";
import { db } from "@vercel/postgres";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// We are uing a type validation library to validate form data
// before using it for storing on the database
const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({ message: "Please select a customer." }),
  amount: z.coerce
    .number()
    .gt(0, { message: "Please enter an amount greater than $0." }),
  status: z.enum(["pending", "paid"], {
    message: "Please select an invoice status.",
  }),
  date: z.string(),
});

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

const CreateInvoice = FormSchema.omit({ id: true, date: true });

export async function createInvoice(prevState: State, formData: FormData) {
  const validatedFields = CreateInvoice.safeParse(
    //get data from form
    Object.fromEntries(formData.entries())
  );

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Missing Fields. Failed to Create Invoice.",
    };
  }

  // Good practice to store monetary values in cents in your database
  // to eliminate JavaScript floating-point errors
  const amountInCents = validatedFields.data.amount * 100;

  const date = new Date().toISOString().split("T")[0];

  try {
    // Connect to database since we are using supabase
    // (better explanation in app/lib/data.ts)
    const client = await db.connect();

    await client.sql`
      INSERT INTO invoices (customer_id, amount, status, date)
      VALUES (${validatedFields.data.customerId}, ${amountInCents}, ${validatedFields.data.status}, ${date})
    `;
  } catch (error) {
    console.log(error);
    // If a database error occurs, return a more specific error.
    return {
      message: "Database Error: Failed to Create Invoice.",
    };
  }

  // Clear invoice chached data and trigger new request
  revalidatePath("/dashboard/invoices");
  // Once revalidated we can redirect to desired page
  redirect("/dashboard/invoices");
}

const UpdateInvoice = FormSchema.omit({ id: true, date: true });
export async function updateInvoice(
  id: string,
  prevState: State,
  formData: FormData
) {
  const validatedFields = UpdateInvoice.safeParse(
    Object.fromEntries(formData.entries())
  );

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Missing Fields. Failed to Edit Invoice.",
    };
  }

  const amountInCents = validatedFields.data.amount * 100;

  try {
    const client = await db.connect();

    await client.sql`
        UPDATE invoices
        SET customer_id = ${validatedFields.data.customerId}, amount = ${amountInCents}, status = ${validatedFields.data.status}
        WHERE id = ${id}
      `;
  } catch (error) {
    console.log(error);
    return { message: "Database Error: Failed to Update Invoice." };
  }

  revalidatePath("/dashboard/invoices");
  redirect("/dashboard/invoices");
}

export async function deleteInvoice(id: string) {
  try {
    const client = await db.connect();

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
    return { message: "Failed to Delete Invoice." };
  }
}
