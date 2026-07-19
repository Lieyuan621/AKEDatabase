AKEData se ha trasladado al dominio www.akedata.wiki. El dominio anterior, akedata.top, ahora redirige aquí.

# Registro de actualizaciones de AKEData

### v1.2.1

Se corrigió un problema por el que algunas imágenes del juego podían solicitarse por error desde `www.akedata.wiki` después de cambiar de módulo o reiniciar el Service Worker. Las rutas de imagen ahora se reescriben de forma síncrona a `data.akedata.wiki` al insertarse en la página.

El Service Worker ahora restaura el origen de datos y la revisión de los datos compartidos desde su URL de registro. Así, el enrutamiento de imágenes se conserva incluso cuando el navegador detiene y reinicia el Worker. El icono del sitio también se carga directamente desde el origen de datos.

Se añadió el análisis de enemigos de `LevelScriptData` al cálculo de atributos de Mazmorras, Contingency Contract y Echoes of War. Ahora se leen enemigos, niveles y Buffs iniciales definidos directamente en los scripts, además de Buffs condicionales aplicados mediante generadores. Esto permite calcular correctamente etapas sin SpawnerConfig. También se corrigieron la precarga de Buffs de condiciones de Contingency Contract y el recálculo al cambiar condiciones.

Se mejoraron las ayudas de valores originales. Los valores sin cambios de cálculo siguen mostrando el valor original; los modificados por atributos, Buffs, condiciones de contrato o expresiones muestran ahora el valor original, los parámetros sustituidos, la fórmula completa y el resultado final. El seguimiento de fórmulas cubre Mazmorras, Contingency Contract, Echoes of War, enemigos y las expresiones calculadas de personajes, armas, equipo y objetos.

### v1.2.0

Se añadió la comparación de datos entre versiones del juego. Al seleccionar `Latest`, el sitio compara automáticamente con el último Hotfix de la versión anterior. Las entradas nuevas siempre aparecen primero y reciben una etiqueta; las etiquetas de modificaciones y el Diff detallado se activan mediante la opción experimental global, desactivada de forma predeterminada.

El Diff detallado solo compara la información visible en la página: muestra las eliminaciones en rojo y las adiciones en verde, e ignora los campos ocultos. Las actividades quedan excluidas de la detección de novedades. El equipo y las medallas se comparan por ID individual y también se etiquetan sus conjuntos o categorías. Los bordes de las tarjetas conservan el color de rareza.

### v1.2.0-pre2

Se actualizó el mapeo completo de Attribute, se añadieron los ID 93–100 y se sincronizó `maps.json` en los 14 idiomas.

Los módulos de enemigos y mazmorras ahora usan los nuevos parámetros de resistencia elemental (ID 94–99). Los antiguos multiplicadores de resistencia, ID 80–85, ya no aparecen en las tarjetas de atributos, los resúmenes de modificadores ni las descripciones emergentes de Buff relacionadas.

### v1.1.9

Se añadió el módulo del desafío permanente «Ecos de guerra», con vistas por temporada y rotación para consultar niveles, dificultades, títulos de clasificación, recompensas de mérito e instrucciones oficiales. También muestra oleadas de enemigos, mapas de aparición, Buff iniciales y atributos ajustados por nivel, con cambio de oleada y resaltado vinculado en el mapa.

### v1.1.8

Se añadieron el modo de depuración y la actualización forzada del caché web; se corrigieron los nodos de atributos de personajes y el análisis de costes de desarrollo según las descripciones de objetos; los tipos de actividad ahora proceden de ActivityTagTable; los estilos y términos de texto enriquecido se leen directamente de TableCfg; y los módulos con página inicial recibieron un botón de inicio en la barra lateral.

### v1.1.6

Se agregaron avisos dentro del sitio y una cuenta regresiva para actualizaciones, se adaptaron los grupos de habilidades de dos formas de Jue, se optimizaron los mensajes de carga y se eliminaron numerosos módulos v2 obsoletos.

### v1.1.5

Se lanzó el framework multilingüe, que permite cambiar el idioma de la interfaz, los módulos, los filtros y los mapeos de datos, junto con el primer conjunto de recursos localizados.

### v1.1.4

Se corrigieron los parámetros de versión de las solicitudes de datos, se separaron las versiones de actualización de los recursos de la aplicación y los datos públicos, y se unificó la validación de versiones del caché de páginas y el Service Worker.

### v1.1.3

El módulo de objetos incorporó efectos de uso de consumibles y recetas de síntesis, además de relaciones entre materiales y productos, estilos de detalle y la adaptación de datos v3 correspondiente.

### v1.1.2

Se agregaron accesos de vista general mediante tarjetas agrupadas a los módulos de personajes, armas, enemigos, equipamiento, actividades, objetos, dungeons, medallas e investigación.

### v1.1.1

Se rediseñaron los filtros de categorías de objetos con opciones para contraer y contar resultados; también se mejoraron la deduplicación de solicitudes, el caché IndexedDB y la visualización del progreso de carga de datos.

### v1.1.0

Se lanzó la capa de adaptación de datos v3 basada en TableCfg y Json para los principales módulos de consulta, junto con la desactivación de módulos y el caché de archivos de datos grandes.

### v1.0.31

Se habían incorporado el cambio entre interfaces en chino e inglés, el cambio del directorio de datos y las configuraciones de internacionalización relacionadas, pero la función se revirtió por completo después y no siguió disponible en esta etapa.

### v1.0.30

Se agregó un wrapper unificado para el caché de solicitudes y todas las páginas adoptaron akeFetch para cargar datos, reduciendo solicitudes repetidas y optimizando la carga al cambiar de módulo.

### v1.0.29

Los scripts integrados de la página principal y los módulos se separaron en el directorio plugin/js, centralizando la administración del enrutamiento, la configuración, los cálculos de atributos y los controladores de módulos.

### v1.0.28

Se agregaron indicaciones con los valores originales a los parámetros de la mayoría de los módulos, y se corrigieron el cálculo de vida de los enemigos y la visualización de «reducción de todo el daño».

### v1.0.27

Contrato de Contingencia recibió una visualización de oleadas enemigas con coordenadas de aparición, cambio de oleada y resaltado vinculado, además de corregirse las estadísticas combinadas de oleadas repetidas.

### v1.0.26

Contrato de Contingencia incorporó la consulta de atributos enemigos, que calcula y muestra los valores reales según el nivel, los Buff de nacimiento y los términos de contrato seleccionados.

### v1.0.25

Se precargó y habilitó el módulo Contrato de Contingencia restringido por Token, con búsqueda de temporadas, condiciones y conflictos de términos, puntuación, recompensas, misiones y tienda.

### v1.0.24

Se actualizó la visualización de habilidades de personajes v2, corrigiendo el orden de las habilidades combinadas y definitivas y conservando parámetros clave como el tiempo de recarga y el consumo de energía.

### v1.0.23

Se abrió oficialmente el módulo de investigación, con mejoras en Markdown, resaltado de código, índice, navegación por anclas y vista previa de imágenes, además de nuevos artículos sobre mecánicas.

### v1.0.22

Se agregaron restricciones de acceso a módulos y contenido basadas en Token, con persistencia, incorporación masiva y eliminación de Token, además de la precarga de contenido protegido.

### v1.0.21

La tabla de crecimiento de atributos de personajes v2 incorporó coeficientes de daño de anomalía física y mágica, con distintos niveles de precisión según el modo de visualización.

### v1.0.20

Se ajustaron el orden y algunos nombres de los atributos detallados de los enemigos, adelantando resistencia a interrupción y ejecución, y unificando la redacción de los términos de bonificación de daño.

### v1.0.19

El módulo de equipamiento incorporó la visualización del ID de equipamiento; también se reorganizaron los estilos v2 de personajes, armas y equipamiento, y se corrigieron los colores de atributos y la selección de valores de crecimiento.

### v1.0.18

Se agregaron deep link para módulos y entradas, sincronizando la barra de direcciones durante la navegación y gestionando contenido oculto o inexistente, además de completar la visualización de tipos de corrección de atributos de personajes.

### v1.0.17

El módulo de armas v2 se lanzó oficialmente, con búsqueda de armas y datos detallados de atributos por nivel, materiales de mejora, potenciales y habilidades.

### v1.0.16

El módulo de equipamiento v2 se lanzó oficialmente, mostrando por conjunto las piezas, los atributos principales y secundarios, las habilidades del conjunto, las recetas de fabricación, la garantía de refinamiento y la información de mejora.

### v1.0.15

El módulo de dungeons v2 se lanzó oficialmente, con series, recompensas y detalles de enemigos, además del análisis de configuraciones de aparición y Buff para mostrar oleadas y atributos corregidos.

### v1.0.14

El módulo de enemigos v2 se lanzó oficialmente, incorporando búsqueda, lista móvil, atributos por nivel, variantes de enemigos, modificaciones de atributos, resistencias e información de desequilibrio.

### v1.0.13

El módulo de personajes v2 se lanzó oficialmente, renovando atributos, habilidades, talentos, potenciales y crecimiento de personajes, y corrigiendo características, imágenes y visualización de nodos.

### v1.0.12

Se mejoró la timeline de SkillData v2 con filtro de acciones, diagrama de flujo de ramas condicionales, visibilidad de nodos e indicaciones de duración de frames, además de corregirse algunos valores de enemigos.

### v1.0.11

Se agregó una vista de depuración oculta de SkillData v2, que muestra la lógica de habilidades mediante una timeline y nodos de acción, con búsqueda y consulta de datos originales.

### v1.0.10

Continuó la renovación de personajes v2, estableciendo una nueva página de detalles e integrando los datos completos de personajes, con mapeos de campos y una estructura de visualización mejorados.

### v1.0.9

Se agregó el módulo de consulta SpawnerConfig para explorar datos de generadores por escena y configuración, y también se ajustaron los accesos de consulta de BuffData y SkillData.

### v1.0.8

Se agregaron los módulos de consulta BuffData y SkillData, con navegación por listas, búsqueda y detalles, ofreciendo un acceso para investigar los datos fundamentales de combate.

### v1.0.7

Se agregó la consulta de información de actividades, se ajustó la visualización predeterminada de términos de personajes con soporte para los términos especiales de Laecy y se incorporaron estadísticas de visitas al sitio.

### v1.0.6

La página Acerca de recibió una lista de patrocinadores y los estilos correspondientes, completando la presentación de agradecimientos del proyecto.

### v1.0.5

Se completó la adaptación para dispositivos móviles de los principales módulos de personajes, armas, enemigos, equipamiento, objetos, dungeons y logros, incluidos los tres temas.

### v1.0.4

Se agregaron filtros a los módulos de personajes, armas y objetos, y se rediseñó el área de filtros de las listas para agilizar la búsqueda entre grandes cantidades de entradas.

### v1.0.3

Se agregó la interfaz de consulta de objetos y se registró el módulo correspondiente, con lista de objetos, detalles y visualización de información básica relacionada.

### v1.0.2

La página de personajes incorporó iconos de habilidades y habilidades logísticas, incluidos el tipo de instalación, el nivel, la descripción y las condiciones de desbloqueo, además de corregirse los datos relacionados.

### v1.0.1

Se corrigió la visualización anómala de los datos de atributos fijos de los enemigos y también se completó la información de enemigos en la página de dungeons.

### v1.0.0

AKEData 1.0 se lanzó oficialmente, concentrando las mejoras en el contenido de consulta de dungeons y elevando la versión del proyecto de 0.99 a 1.0.
