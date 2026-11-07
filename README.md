# Pomodoro

Temporizador Pomodoro minimalista con fondos de acuarela, sonidos ambientales y una agenda de tareas.

**Demo:** https://areslevel.github.io/pomodoro/

## Qué tiene
- Temporizador de enfoque y descansos con duraciones personalizables.
- Seis escenas de acuarela (una por color), cada una con su paleta y sonido ambiente sugerido.
- Sonidos ambientales y alarma sintetizados con WebAudio, sin archivos de audio.
- Reproductor de Spotify incrustado que sigue al temporizador.
- Agenda de tareas con fecha, prioridad, subtareas, notas, listas, etiquetas y rutinas.

## Cómo usarlo
Es una página estática: abre `index.html` en el navegador o sírvela con cualquier servidor de archivos.

## Regenerar los fondos
```
python generar_acuarelas.py            # todas las escenas
python generar_acuarelas.py amarillo   # una sola
```
Necesita Python con Pillow y Microsoft Edge (para renderizar el SVG).

## Licencia
MIT. Ver [LICENSE](LICENSE).
