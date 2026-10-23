// Fixtures CONTROLADOS para pruebas. No se usan nunca en la aplicación ni se
// mezclan con extracciones reales: reproducen casos que los datos reales
// rara vez traen (nulos, duplicados, arrays incoherentes, tipos erróneos).

const base = {
  latitude: 41.441124,
  longitude: 2.2014387,
  generationtime_ms: 0.1,
  utc_offset_seconds: 0,
  timezone: "GMT",
  timezone_abbreviation: "GMT",
  elevation: 25,
  hourly_units: {
    time: "iso8601",
    temperature_2m: "°C",
    relative_humidity_2m: "%",
    precipitation: "mm",
  },
}

/** Respuesta correcta de 3 horas. */
export const respuestaCorrecta = {
  ...base,
  hourly: {
    time: ["2026-09-01T00:00", "2026-09-01T01:00", "2026-09-01T02:00"],
    temperature_2m: [24.2, 23.6, 23.0],
    relative_humidity_2m: [77, 80, 81],
    precipitation: [0.0, 0.4, 0.0],
  },
}

/** Una hora con cada tipo de defecto. */
export const respuestaConDefectos = {
  ...base,
  hourly: {
    time: [
      "2026-09-01T00:00", // 0 válida
      "2026-09-01T01:00", // 1 temperatura null
      "2026-09-01T02:00", // 2 humedad cadena vacía
      "2026-09-01T03:00", // 3 precipitación negativa
      "2026-09-01T04:00", // 4 humedad > 100
      "2026-02-30T05:00", // 5 fecha imposible
      "2026-09-01T06:00", // 6 temperatura como texto
      "2026-09-01T00:00", // 7 duplicado válido de la 0
      "2026-09-01T07:00", // 8 extremo pero válido
      "2026-09-01T01:00", // 9 duplicado de la 1, pero la 1 era inválida
    ],
    temperature_2m: [20, null, 21, 22, 23, 24, "25", 99, -45.5, 18],
    relative_humidity_2m: [50, 51, "", 53, 101, 55, 56, 57, 0, 60],
    precipitation: [0, 0, 0, -0.1, 0, 0, 0, 0, 100, 0],
  },
}

/** Arrays de longitudes distintas. */
export const respuestaIncoherente = {
  ...base,
  hourly: {
    time: ["2026-09-01T00:00", "2026-09-01T01:00", "2026-09-01T02:00"],
    temperature_2m: [10, 11],
    relative_humidity_2m: [70, 71, 72, 73],
    precipitation: [0, 0, 0],
  },
}

export const respuestaNoUtc = {
  ...respuestaCorrecta,
  utc_offset_seconds: 7200,
  timezone: "Europe/Madrid",
}
