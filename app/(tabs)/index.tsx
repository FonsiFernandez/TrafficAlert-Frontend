import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Pressable,
  ActivityIndicator,
  useColorScheme,
  Platform,
} from "react-native";
import * as Location from "expo-location";
import { Audio } from "expo-av";
import * as Device from "expo-device";

type AlertEvent = {
  id: string;
  type: string;

  title?: string;
  cause?: string;

  road?: string;
  pkText?: string;
  pkKm?: number;

  direction?: string;
  orientation?: string;

  province?: string;
  municipality?: string;

  startTime?: string;
  source?: string;

  lat: number;
  lon: number;
  severity?: number;
};

type AlertHit = {
  event: AlertEvent;
  distanceMeters: number;
};

function getBackendBaseUrl() {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  if (Platform.OS === "web") {
    return "http://localhost:8080/api";
  }

  if (Platform.OS === "android" && !Device.isDevice) {
    return "http://10.0.2.2:8080/api";
  }

  if (Platform.OS === "ios" && !Device.isDevice) {
    return "http://localhost:8080/api";
  }

  // móvil físico: IP de tu PC en la misma WiFi
  return "http://192.168.1.40:8080/api";
}

const BACKEND_BASE_URL = getBackendBaseUrl();

function Field({
  label,
  value,
  textColor,
  mutedColor,
}: {
  label: string;
  value?: string | number | null;
  textColor: string;
  mutedColor: string;
}) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <Text style={{ color: textColor, lineHeight: 20 }}>
      <Text style={{ color: mutedColor, fontWeight: "800" }}>{label}: </Text>
      {String(value)}
    </Text>
  );
}

export default function HomeScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const t = useMemo(() => getTheme(isDark), [isDark]);

  const [driving, setDriving] = useState(false);
  const [status, setStatus] = useState("Listo");
  const [busy, setBusy] = useState(false);

  const [lastHit, setLastHit] = useState<AlertHit | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Permiso requerido", "Sin ubicación no hay alertas.");
      }
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    })();

    return stopDriving;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function beep() {
    try {
      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync(
          require("../../assets/beep.mp3")
        );
        soundRef.current = sound;
      }
      await soundRef.current.replayAsync();
    } catch {
      // MVP: si falla el sonido, seguimos
    }
  }

  async function tick() {
    setBusy(true);
    try {
      setStatus("Obteniendo ubicación…");
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = pos.coords;

      setStatus("Consultando incidencias…");
      const url = `${BACKEND_BASE_URL}/alerts?lat=${latitude}&lon=${longitude}&radiusMeters=2000`;
      const res = await fetch(url);

      if (!res.ok) {
        setStatus(`Backend ${res.status}`);
        return;
      }

      const hits = (await res.json()) as AlertHit[];
      if (!hits.length) {
        setStatus("Sin incidencias cercanas");
        setLastHit(null);
        return;
      }

      const hit = hits[0];
      setLastHit(hit);
      setStatus("ALERTA");
      await beep();
    } catch (e) {
      setStatus("Error consultando backend");
    } finally {
      setBusy(false);
    }
  }

  function startDriving() {
    setDriving(true);
    setStatus("Conducción activa");
    tick();
    timerRef.current = setInterval(tick, 30000);
  }

  function stopDriving() {
    setDriving(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setBusy(false);
    setStatus("Parado");
  }

  const pillStyle =
    status === "ALERTA"
      ? { backgroundColor: t.dangerBg, borderColor: t.dangerBorder }
      : { backgroundColor: t.pillBg, borderColor: t.border };

  const pillTextStyle =
    status === "ALERTA" ? { color: t.dangerText } : { color: t.text };

  const headline =
    lastHit?.event?.title ??
    (lastHit ? "Incidencia" : "—");

  const subline =
    lastHit
      ? `${headline} (${lastHit.event.id}) a ${(lastHit.distanceMeters / 1000).toFixed(
          1
        )} km`
      : "—";

  const e = lastHit?.event;

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]}>TrafficAlert</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>
          MVP • alertas simples cerca de ti
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: t.muted }]}>Estado</Text>
          <View style={[styles.pill, pillStyle]}>
            <Text style={[styles.pillText, pillTextStyle]}>{status}</Text>
          </View>
        </View>

        <View style={styles.dividerWrap}>
          <View style={[styles.divider, { backgroundColor: t.border }]} />
        </View>

        <Text style={[styles.label, { color: t.muted }]}>Última alerta</Text>

        <Text
          style={[
            styles.alertText,
            { color: status === "ALERTA" ? t.dangerText : t.text },
          ]}
          numberOfLines={2}
        >
          {subline}
        </Text>

        {e && (
          <View style={{ gap: 6, marginTop: 10 }}>
            <Field label="Tipo" value={e.type} textColor={t.text} mutedColor={t.muted} />
            <Field label="Causa" value={e.cause} textColor={t.text} mutedColor={t.muted} />
            <Field label="Carretera" value={e.road} textColor={t.text} mutedColor={t.muted} />
            <Field
              label="PK"
              value={e.pkText ?? (e.pkKm !== undefined ? e.pkKm : null)}
              textColor={t.text}
              mutedColor={t.muted}
            />
            <Field label="Sentido" value={e.direction} textColor={t.text} mutedColor={t.muted} />
            <Field
              label="Orientación"
              value={e.orientation}
              textColor={t.text}
              mutedColor={t.muted}
            />
            <Field label="Desde" value={e.startTime} textColor={t.text} mutedColor={t.muted} />
            <Field label="Provincia" value={e.province} textColor={t.text} mutedColor={t.muted} />
            <Field
              label="Municipio"
              value={e.municipality}
              textColor={t.text}
              mutedColor={t.muted}
            />
            <Field label="Fuente" value={e.source} textColor={t.text} mutedColor={t.muted} />

            <Field
              label="Coords"
              value={`${e.lat.toFixed(5)}, ${e.lon.toFixed(5)}`}
              textColor={t.text}
              mutedColor={t.muted}
            />
            <Field
              label="Severidad"
              value={e.severity ?? null}
              textColor={t.text}
              mutedColor={t.muted}
            />
          </View>
        )}

        <View style={styles.cardFooter}>
          {busy ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <Text style={[styles.loadingText, { color: t.muted }]}>
                Actualizando…
              </Text>
            </View>
          ) : (
            <Text style={[styles.hint, { color: t.muted }]}>
              Actualiza cada 30s mientras conduces
            </Text>
          )}
        </View>
      </View>

      <View style={styles.actions}>
        {!driving ? (
          <Pressable
            onPress={startDriving}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: t.primary },
              pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
            ]}
          >
            <Text style={[styles.primaryBtnText, { color: t.primaryText }]}>
              Iniciar conducción
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={stopDriving}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: t.border, backgroundColor: t.card },
              pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
            ]}
          >
            <Text style={[styles.secondaryBtnText, { color: t.text }]}>
              Detener
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={tick}
          disabled={!driving || busy}
          style={({ pressed }) => [
            styles.ghostBtn,
            { borderColor: t.border },
            (!driving || busy) && { opacity: 0.5 },
            pressed && driving && !busy && { opacity: 0.9 },
          ]}
        >
          <Text style={[styles.ghostBtnText, { color: t.text }]}>
            Probar ahora
          </Text>
        </Pressable>

        <Text style={[styles.smallNote, { color: t.muted }]}>
          Backend: {BACKEND_BASE_URL}
        </Text>
      </View>
    </View>
  );
}

function getTheme(isDark: boolean) {
  if (isDark) {
    return {
      bg: "#0B0F14",
      card: "#121823",
      text: "#EAF0F6",
      muted: "#9AA7B2",
      border: "#223044",
      pillBg: "#162233",
      primary: "#4F8CFF",
      primaryText: "#071018",
      dangerBg: "#2A1114",
      dangerBorder: "#5B1E25",
      dangerText: "#FFB4BD",
    };
  }
  return {
    bg: "#F4F6F9",
    card: "#FFFFFF",
    text: "#0B1220",
    muted: "#5E6B78",
    border: "#E2E8F0",
    pillBg: "#EEF4FF",
    primary: "#2563EB",
    primaryText: "#FFFFFF",
    dangerBg: "#FFECEF",
    dangerBorder: "#FFC7D0",
    dangerText: "#B4232C",
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 18,
    justifyContent: "space-between",
  },
  header: {
    marginTop: 18,
    gap: 6,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 14,
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  dividerWrap: {
    paddingVertical: 4,
  },
  divider: {
    height: 1,
    width: "100%",
    opacity: 0.9,
  },
  alertText: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
  },
  cardFooter: {
    marginTop: 6,
  },
  hint: {
    fontSize: 12,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: "600",
  },
  actions: {
    gap: 12,
    marginBottom: 18,
  },
  primaryBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: "800",
  },
  ghostBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  ghostBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  smallNote: {
    fontSize: 11,
    lineHeight: 16,
  },
});
