<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/equipos" text="" />
        </ion-buttons>
        <ion-title>{{ id ? 'Editar equipo' : 'Nuevo equipo' }}</ion-title>
      </ion-toolbar>
      <ion-toolbar v-if="!conectado" color="warning">
        <ion-title size="small">Sin conexión: no es posible guardar</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <form @submit.prevent="guardar" novalidate>
        <ion-list lines="full">
          <ion-item>
            <ion-input v-model="datos.codigo" label="Código" label-placement="stacked" placeholder="EQ-0000"
              autocapitalize="characters" :maxlength="20" />
          </ion-item>
          <small v-if="errores.codigo" class="error-campo">{{ errores.codigo }}</small>

          <ion-item>
            <ion-input v-model="datos.nombre" label="Nombre" label-placement="stacked" :maxlength="120" />
          </ion-item>
          <small v-if="errores.nombre" class="error-campo">{{ errores.nombre }}</small>

          <ion-item>
            <ion-select v-model="datos.categoria_id" label="Categoría" label-placement="stacked"
              interface="action-sheet" placeholder="Seleccione" cancel-text="Cancelar">
              <ion-select-option v-for="c in listaCategorias" :key="c.id" :value="c.id">{{ c.nombre }}</ion-select-option>
            </ion-select>
          </ion-item>
          <small v-if="errores.categoria_id" class="error-campo">{{ errores.categoria_id }}</small>

          <ion-item v-if="estadoActual !== 'prestado'">
            <ion-select v-model="datos.estado" label="Estado" label-placement="stacked" interface="popover">
              <ion-select-option value="disponible">Disponible</ion-select-option>
              <ion-select-option value="mantenimiento">Mantenimiento</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item v-else>
            <ion-label>Estado: prestado (no se modifica desde aquí)</ion-label>
          </ion-item>
          <small v-if="errores.estado" class="error-campo">{{ errores.estado }}</small>

          <ion-item>
            <ion-input v-model="datos.fecha_adquisicion" label="Fecha de adquisición" label-placement="stacked"
              type="date" :max="hoy" />
          </ion-item>
          <small v-if="errores.fecha_adquisicion" class="error-campo">{{ errores.fecha_adquisicion }}</small>

          <ion-item>
            <ion-input v-model="datos.costo_interno" label="Costo interno (₡)" label-placement="stacked"
              type="number" inputmode="decimal" :min="0"
              :helper-text="id ? 'La API no expone este dato: vuelva a ingresarlo.' : undefined" />
          </ion-item>
          <small v-if="errores.costo_interno" class="error-campo">{{ errores.costo_interno }}</small>
        </ion-list>

        <ion-button type="submit" expand="block" class="ion-margin-top" :disabled="!conectado || guardando">
          Guardar
        </ion-button>
      </form>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonList, IonItem,
  IonInput, IonSelect, IonSelectOption, IonLabel, IonButton,
  loadingController, onIonViewWillEnter, useIonRouter,
} from '@ionic/vue';
import { actualizar, categorias, crear, obtener, type Categoria, type DatosEquipo, type Estado } from '@/services/equipos';
import { ErrorApi } from '@/services/errores';
import { mostrarToast } from '@/services/avisos';
import { useConexion, vibrar } from '@/composables/useConexion';

// id llega por props: true en la ruta equipos/:id/editar; en equipos/nuevo es undefined
const props = defineProps<{ id?: string }>();
const id = computed(() => props.id);

const ionRouter = useIonRouter();
const { conectado } = useConexion();
const hoy = new Date().toISOString().slice(0, 10);

const vacio = (): DatosEquipo => ({
  codigo: '', nombre: '', categoria_id: null, estado: 'disponible', fecha_adquisicion: hoy, costo_interno: null,
});

const datos = reactive<DatosEquipo>(vacio());
const listaCategorias = ref<Categoria[]>([]);
const estadoActual = ref<Estado>('disponible');
const errores = ref<Record<string, string>>({});
const guardando = ref(false);

/**
 * TODO [M5] Al entrar a la página:
 *  - Cargar las categorías para el ion-select (categorias()).
 *  - Nuevo: dejar el formulario vacío con vacio().
 *  - Edición: obtener(id) y llenar datos. Guarde el estado actual en estadoActual.
 *    costo_interno queda en null: la API no lo devuelve (EquipoResource lo oculta).
 *  - 404 → toast y volver a /tabs/equipos.
 */
onIonViewWillEnter(async () => {
  errores.value = {};
  Object.assign(datos, vacio());
  estadoActual.value = 'disponible';

  let loading: Awaited<ReturnType<typeof loadingController.create>> | undefined;
  let cargandoEquipo = false;
  try {
    loading = await loadingController.create({ message: 'Cargando equipo…' });
    await loading.present();

    listaCategorias.value = await categorias();
    if (!id.value) return;

    cargandoEquipo = true;
    const equipo = await obtener(id.value);
    estadoActual.value = equipo.estado;
    Object.assign(datos, {
      codigo: equipo.codigo,
      nombre: equipo.nombre,
      categoria_id: equipo.categoria?.id ?? null,
      estado: equipo.estado === 'prestado' ? 'disponible' : equipo.estado,
      fecha_adquisicion: equipo.fecha_adquisicion?.slice(0, 10) ?? hoy,
      costo_interno: null,
    });
  } catch (e) {
    if (cargandoEquipo && e instanceof ErrorApi && e.status === 404) {
      await mostrarToast('El equipo ya no existe.', 'warning');
      volverALista();
    } else {
      await mostrarToast('No se pudo cargar el formulario.', 'danger');
    }
  } finally {
    await loading?.dismiss().catch(() => undefined);
  }
});

/**
 * TODO [M5] guardar()
 *  1. Mostrar loadingController ("Guardando…") y cerrarlo SIEMPRE, salga bien o mal.
 *  2. Enviar el cuerpo con código en mayúscula y sin espacios sobrantes, y costo_interno como número.
 *     Si el equipo está prestado, no envíe el campo estado.
 *  3. Nuevo → crear(); edición → actualizar(id).
 *  4. Éxito: vibrar() [M7], toast y volver a la lista con useIonRouter (back si se puede).
 *  5. 422 → mostrar el primer mensaje de cada campo debajo de su campo (error.erroresPorCampo).
 *     404 → toast "El equipo ya no existe."   ·   otros → toast genérico.
 */
async function guardar() {
  errores.value = {};
  guardando.value = true;

  let loading: Awaited<ReturnType<typeof loadingController.create>> | undefined;
  try {
    loading = await loadingController.create({ message: 'Guardando…' });
    await loading.present();

    const costoOriginal = datos.costo_interno as number | string | null;
    const costo = costoOriginal === null || costoOriginal === '' ? null : Number(costoOriginal);
    const payload: DatosEquipo = {
      codigo: datos.codigo.trim().toUpperCase(),
      nombre: datos.nombre.trim(),
      categoria_id: datos.categoria_id === null ? null : Number(datos.categoria_id),
      fecha_adquisicion: datos.fecha_adquisicion,
      costo_interno: costo !== null && Number.isFinite(costo) ? costo : null,
    };
    if (estadoActual.value !== 'prestado') payload.estado = datos.estado;

    if (id.value) await actualizar(id.value, payload);
    else await crear(payload);

    await vibrar();
    await mostrarToast(id.value ? 'Equipo actualizado.' : 'Equipo creado.', 'success');
    volverALista();
  } catch (e) {
    if (e instanceof ErrorApi && e.status === 422) {
      errores.value = e.erroresPorCampo;
    } else if (e instanceof ErrorApi && e.status === 404) {
      await mostrarToast('El equipo ya no existe.', 'warning');
      volverALista();
    } else {
      await mostrarToast('No se pudo guardar el equipo.', 'danger');
    }
  } finally {
    await loading?.dismiss().catch(() => undefined);
    guardando.value = false;
  }
}

function volverALista() {
  if (ionRouter.canGoBack()) ionRouter.back();
  else ionRouter.push('/tabs/equipos');
}
</script>
