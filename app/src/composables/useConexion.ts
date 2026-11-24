import { onUnmounted, ref } from 'vue';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Network } from '@capacitor/network';

/**
 * Capacidades nativas: estado de red y vibración.
 *
 * useConexion() devuelve { conectado, tipo }:
 *   - Valor inicial con Network.getStatus()                       (@capacitor/network)
 *   - Se actualiza solo con Network.addListener('networkStatusChange', ...)
 *   - El oyente se libera (handle.remove()) cuando se destruye la página que lo usa (onUnmounted).
 *   Las páginas Equipos y Formulario ya muestran el aviso "Sin conexión" y deshabilitan Guardar con `conectado`.
 */
export function useConexion() {
  const conectado = ref(true);
  const tipo = ref('unknown');

  let desmontado = false;
  let quitarOyente: (() => Promise<void>) | undefined;

  void Network.getStatus()
    .then((estado) => {
      if (desmontado) return;
      conectado.value = estado.connected;
      tipo.value = estado.connectionType;
    })
    .catch(() => undefined);

  void Network.addListener('networkStatusChange', (estado) => {
    conectado.value = estado.connected;
    tipo.value = estado.connectionType;
  }).then((oyente) => {
    if (desmontado) return oyente.remove();
    quitarOyente = () => oyente.remove();
  }).catch(() => undefined);

  onUnmounted(() => {
    desmontado = true;
    void quitarOyente?.().catch(() => undefined);
  });

  return { conectado, tipo };
}

/**
 * vibrar(): vibración breve de confirmación con Haptics.impact({ style: ImpactStyle.Light })
 *   (@capacitor/haptics). En el navegador NO debe hacer nada: use Capacitor.isNativePlatform().
 *   Se llama después de guardar y de eliminar con éxito.
 */
export async function vibrar() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // La vibración es una confirmación opcional y no debe interrumpir el flujo.
  }
}
