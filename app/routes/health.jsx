import supabase from "../lib/supabase.server";

export const loader = async () => {
  try {
    // Perform a trivial Supabase query (SELECT 1)
    const { error } = await supabase.from("shops").select("1").limit(1);

    if (error) {
      console.error("Health check Supabase error:", error);
      return new Response(
        JSON.stringify({ status: "error", message: error.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Health check error:", error);
    return new Response(
      JSON.stringify({ status: "error", message: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

