import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  const store = getStore("telemetria");

  // Si recibe un POST desde Unity o Postman, suma 1 al contador
  if (req.method === "POST") {
    const actual = (await store.get("play_clicks", { type: "json" })) || { total: 0 };
    actual.total += 1;
    await store.setJSON("play_clicks", actual);

    return new Response(JSON.stringify({ mensaje: "Clic registrado", total: actual.total }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Si recibe un GET, devuelve cuántas personas han presionado Play
  if (req.method === "GET") {
    const actual = (await store.get("play_clicks", { type: "json" })) || { total: 0 };
    return new Response(JSON.stringify(actual), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response("Método no permitido", { status: 405 });
};