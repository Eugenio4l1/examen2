<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Equipos</ion-title>
        <ion-buttons slot="end">
          <ion-button router-link="/tabs/equipos/nuevo" aria-label="Nuevo equipo">
            <ion-icon slot="icon-only" :icon="add" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar v-model="q" :debounce="400" placeholder="Buscar por código o nombre" @ion-input="buscar" />
      </ion-toolbar>
      <!-- YA IMPLEMENTADO: depende de useConexion() [M7] -->
      <ion-toolbar v-if="!conectado" color="warning">
        <ion-title size="small">Sin conexión: los datos pueden estar desactualizados</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" @ionRefresh="refrescar">
        <ion-refresher-content />
      </ion-refresher>

      <!-- Primera carga: skeleton -->
      <ion-list v-if="cargando && equipos.length === 0">
        <ion-item v-for="n in 6" :key="n">
          <ion-label>
            <h2><ion-skeleton-text animated style="width: 60%" /></h2>
            <p><ion-skeleton-text animated style="width: 40%" /></p>
          </ion-label>
        </ion-item>
      </ion-list>

      <!-- Error -->
      <div v-else-if="error" class="estado-vacio">
        <ion-icon :icon="cloudOfflineOutline" />
        <p>{{ error }}</p>
        <ion-button @click="cargar(true)">Reintentar</ion-button>
      </div>

      <!-- Vacío -->
      <div v-else-if="equipos.length === 0" class="estado-vacio">
        <ion-icon :icon="searchOutline" />
        <p>No hay equipos que coincidan.</p>
      </div>

      <!-- Lista -->
      <ion-list v-else>
        <ion-item-sliding v-for="equipo in equipos" :key="equipo.id">
          <ion-item :router-link="`/tabs/equipos/${equipo.id}/editar`" detail>
            <ion-label>
              <h2>{{ equipo.nombre }}</h2>
              <p>{{ equipo.codigo }} · {{ equipo.categoria.nombre }}</p>
            </ion-label>
            <ion-badge slot="end" :color="colorEstado[equipo.estado]">{{ equipo.estado }}</ion-badge>
          </ion-item>
          <ion-item-options side="end">
            <ion-item-option color="danger" @click="confirmarEliminacion(equipo, $event)">
              <ion-icon slot="start" :icon="trashOutline" />
              Eliminar
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      </ion-list>

      <ion-infinite-scroll :disabled="!hayMas || equipos.length === 0" @ionInfinite="cargarMas">
        <ion-infinite-scroll-content />
      </ion-infinite-scroll>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonSearchbar, IonContent,
  IonRefresher, IonRefresherContent, IonList, IonItem, IonLabel, IonSkeletonText, IonBadge,
  IonItemSliding, IonItemOptions, IonItemOption, IonInfiniteScroll, IonInfiniteScrollContent,
  alertController, onIonViewWillEnter,
} from '@ionic/vue';
import type { InfiniteScrollCustomEvent, RefresherCustomEvent } from '@ionic/vue';
import { add, cloudOfflineOutline, searchOutline, trashOutline } from 'ionicons/icons';
import { eliminar, listar, type Equipo, type Estado } from '@/services/equipos';
import { ErrorApi } from '@/services/errores';
import { mostrarToast } from '@/services/avisos';
import { useConexion, vibrar } from '@/composables/useConexion';

const colorEstado: Record<Estado, string> = { disponible: 'success', prestado: 'warning', mantenimiento: 'medium' };

const { conectado } = useConexion();

const equipos = ref<Equipo[]>([]);
const pagina = ref(0);
const ultimaPagina = ref(1);
const q = ref('');
const cargando = ref(true);
const error = ref('');
const hayMas = computed(() => pagina.value < ultimaPagina.value);

async function cargar(reiniciar = false) {
  if (!reiniciar && (cargando.value || !hayMas.value)) return;
  const siguiente = reiniciar ? 1 : pagina.value + 1;
  cargando.value = true;
  error.value = '';
  try {
    const respuesta = await listar(siguiente, q.value);
    equipos.value = reiniciar ? respuesta.data : [...equipos.value, ...respuesta.data];
    pagina.value = respuesta.meta.current_page;
    ultimaPagina.value = respuesta.meta.last_page;
  } catch (e) {
    if (reiniciar) equipos.value = [];
    error.value = e instanceof ErrorApi && e.status === 0
      ? 'No hay conexión con el servidor.'
      : 'No se pudo cargar la lista.';
  } finally {
    cargando.value = false;
  }
}

// Se ejecuta cada vez que la página entra en pantalla (onMounted solo corre una vez)
onIonViewWillEnter(() => cargar(true));

const buscar = () => cargar(true);

async function refrescar(evento: RefresherCustomEvent) {
  await cargar(true);
  evento.target.complete();
}

async function cargarMas(evento: InfiniteScrollCustomEvent) {
  await cargar();
  evento.target.complete();
}

async function confirmarEliminacion(equipo: Equipo, evento: Event) {
  const item = (evento.target as HTMLElement).closest('ion-item-sliding') as
    (HTMLElement & { close: () => Promise<void> }) | null;
  await item?.close();

  const alerta = await alertController.create({
    header: 'Eliminar equipo',
    message: `¿Eliminar ${equipo.codigo} · ${equipo.nombre}?`,
    buttons: [
      { text: 'Cancelar', role: 'cancel' },
      { text: 'Eliminar', role: 'destructive' },
    ],
  });
  await alerta.present();
  const { role } = await alerta.onDidDismiss();
  if (role !== 'destructive') return;

  const quitar = () => { equipos.value = equipos.value.filter((e) => e.id !== equipo.id); };

  try {
    await eliminar(equipo.id);
    quitar();
    await vibrar();
    await mostrarToast('Equipo eliminado.');
  } catch (e) {
    if (e instanceof ErrorApi && e.status === 409) {
      const cuerpo = e.cuerpo as { mensaje?: string } | null;
      await mostrarToast(cuerpo?.mensaje ?? 'No se puede eliminar un equipo prestado.');
    } else if (e instanceof ErrorApi && e.status === 404) {
      quitar();
      await mostrarToast('El equipo ya no existe.');
    } else {
      await mostrarToast('No se pudo eliminar el equipo.');
    }
  }
}
</script>