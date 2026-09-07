"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type BlockingEntity = {
  id: string;
  name: string;
  type: "subject" | "object" | "camera";
  position: [number, number, number];
  rotation?: number;
  pitch?: number;
};

type Props = {
  entities: BlockingEntity[];
  onChange?: (entities: BlockingEntity[]) => void;
  onSelect?: (id: string | null) => void;
  focusId?: string | null;
  className?: string;
};

export function Blocking3D({ entities, onChange, onSelect, focusId, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartRotationRef = useRef(0);
  const onChangeRef = useRef(onChange);
  const onSelectRef = useRef(onSelect);
  onChangeRef.current = onChange;
  onSelectRef.current = onSelect;
  const entitiesRef = useRef(entities);
  const focusRef = useRef<string | null>(focusId ?? null);
  entitiesRef.current = entities;
  focusRef.current = focusId ?? null;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#090a0d");
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(7, 8, 9);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    host.replaceChildren(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 20;
    controls.target.set(0, 0, 0);
    const root = new THREE.Group();
    scene.add(root);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const meshes = new Map<string, THREE.Mesh>();
    const labels = new Map<string, THREE.Sprite>();
    const arrows = new Map<string, THREE.ArrowHelper>();
    const grid = new THREE.GridHelper(12, 24, 0x4b5563, 0x1b1e24);
    root.add(grid);
    root.add(new THREE.AxesHelper(2));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x20242c, 2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(4, 8, 5);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const makeLabel = (text: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256; canvas.height = 64;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#f4b942"; context.font = "bold 24px sans-serif";
      context.fillText(text, 8, 40);
      const texture = new THREE.CanvasTexture(canvas);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
      sprite.scale.set(1.5, 0.38, 1);
      return sprite;
    };
    const sync = () => {
      const active = new Set(entitiesRef.current.map((entity) => entity.id));
      for (const [id, mesh] of meshes) if (!active.has(id)) { root.remove(mesh); meshes.delete(id); }
      for (const [id, label] of labels) if (!active.has(id)) { root.remove(label); labels.delete(id); }
      for (const [id, arrow] of arrows) if (!active.has(id)) { root.remove(arrow); arrows.delete(id); }
      for (const entity of entitiesRef.current) {
        let mesh = meshes.get(entity.id);
        if (!mesh) {
          const geometry = entity.type === "object" ? new THREE.BoxGeometry(0.8, 0.25, 0.8) : entity.type === "camera" ? new THREE.BoxGeometry(0.7, 0.42, 0.5) : new THREE.CapsuleGeometry(0.25, 0.65, 4, 8);
          mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: entity.type === "camera" ? 0x60a5fa : entity.type === "object" ? 0x94a3b8 : 0xf4b942, roughness: 0.65, metalness: 0.1 }));
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.entityId = entity.id;
          root.add(mesh); meshes.set(entity.id, mesh);
          const label = makeLabel(entity.name); root.add(label); labels.set(entity.id, label);
          if (entity.type === "camera" || entity.type === "subject") {
            const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), entity.type === "camera" ? 1.1 : 0.75, entity.type === "camera" ? 0x60a5fa : 0xf97316, 0.18, 0.12);
            root.add(arrow); arrows.set(entity.id, arrow);
          }
        }
        mesh.position.set(entity.position[0], entity.position[1] || 0.18, entity.position[2]);
        mesh.rotation.y = entity.rotation ?? 0;
        const label = labels.get(entity.id)!;
        label.position.set(entity.position[0], (entity.position[1] || 0.18) + 0.42, entity.position[2]);
        const arrow = arrows.get(entity.id);
        if (arrow) {
          const yaw = entity.rotation ?? 0;
          const pitch = entity.pitch ?? 0;
          const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
          arrow.position.set(entity.position[0], entity.position[1] || 0.18, entity.position[2]);
          arrow.setDirection(direction);
        }
      }
    };
    const resize = () => { const rect = host.getBoundingClientRect(); renderer.setSize(rect.width, rect.height, false); camera.aspect = rect.width / Math.max(1, rect.height); camera.updateProjectionMatrix(); };
    const move = (event: PointerEvent) => { const activeId = selectedRef.current; if (!draggingRef.current || !activeId) return; const active = entitiesRef.current.find((entity) => entity.id === activeId); if (active?.type === "camera" && event.altKey) { const height = Math.max(0.25, Math.min(8, active.position[1] - (event.movementY || 0) * 0.04)); onChangeRef.current?.(entitiesRef.current.map((entity) => entity.id === activeId ? { ...entity, position: [entity.position[0], height, entity.position[2]] } : entity)); return; } if ((active?.type === "camera" || active?.type === "subject") && event.shiftKey) { const rotation = (dragStartRotationRef.current + (event.clientX - dragStartXRef.current) * 0.012) % (Math.PI * 2); onChangeRef.current?.(entitiesRef.current.map((entity) => entity.id === activeId ? { ...entity, rotation } : entity)); return; } const rect = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); if (!raycaster.ray.intersectPlane(plane, hit)) return; const next = entitiesRef.current.map((entity) => entity.id === activeId ? { ...entity, position: [hit.x, entity.position[1], hit.z] as [number, number, number] } : entity); onChangeRef.current?.(next); };
    const down = (event: PointerEvent) => { const rect = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); const hitObject = raycaster.intersectObjects([...meshes.values()])[0]?.object; const id = (hitObject?.userData.entityId as string) ?? null; selectedRef.current = id; setSelected(id); onSelectRef.current?.(id); draggingRef.current = Boolean(id); const active = entitiesRef.current.find((entity) => entity.id === id); dragStartXRef.current = event.clientX; dragStartRotationRef.current = active?.rotation ?? 0; controls.enabled = !id; renderer.domElement.setPointerCapture(event.pointerId); };
    const up = () => { draggingRef.current = false; controls.enabled = true; };
    renderer.domElement.addEventListener("pointerdown", down); window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("resize", resize);
    let lastFocus: string | null = null; let frame = 0; const loop = () => { sync(); if (focusRef.current && focusRef.current !== lastFocus) { const targetEntity = entitiesRef.current.find((entity) => entity.id === focusRef.current); if (targetEntity) { controls.target.set(targetEntity.position[0], targetEntity.position[1] || 0.2, targetEntity.position[2]); } lastFocus = focusRef.current; } controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(loop); }; resize(); loop();
    return () => { cancelAnimationFrame(frame); controls.dispose(); window.removeEventListener("resize", resize); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); renderer.domElement.removeEventListener("pointerdown", down); renderer.dispose(); host.replaceChildren(); };
  }, []);

  return <div ref={hostRef} className={className ?? "h-72 w-full overflow-hidden rounded-md border border-border"} aria-label="3D场面调度器" />;
}
