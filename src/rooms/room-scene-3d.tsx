'use client';

import {
  ContactShadows,
  Html,
  OrbitControls,
  PerspectiveCamera as DreiPerspectiveCamera,
  RoundedBox,
  useAnimations,
  useGLTF,
} from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Box3,
  CanvasTexture,
  Color,
  Group,
  MathUtils,
  Mesh,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { DeviceCommandKey } from '@/telemetry/contract';
import type { OccupantPose, RoomSceneState } from './room-scene-state';
import { OCCUPANT_PLACEMENTS } from './room-scene-layout';

export type SceneDeviceKey = Extract<
  DeviceCommandKey,
  'lights' | 'exhaustFan' | 'waterPump'
>;

function pointerHandlers(
  key: SceneDeviceKey,
  disabled: boolean,
  onDeviceClick: (key: SceneDeviceKey) => void,
) {
  return {
    onClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      if (!disabled) onDeviceClick(key);
    },
    onPointerOver: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (!disabled) document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      document.body.style.cursor = 'auto';
    },
  };
}

function Box({
  position,
  scale,
  rotation = [0, 0, 0],
  color,
  roughness = 0.7,
  metalness = 0,
  rounded = false,
  castShadow = true,
  receiveShadow = true,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
  color: string;
  roughness?: number;
  metalness?: number;
  rounded?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const radius = Math.min(0.045, Math.min(...scale) * 0.22);
  const material = (
    <meshPhysicalMaterial
      color={color}
      roughness={roughness}
      metalness={metalness}
      clearcoat={metalness > 0.1 ? 0.16 : 0.04}
      clearcoatRoughness={0.55}
    />
  );

  if (!rounded) {
    return (
      <mesh
        position={position}
        rotation={rotation}
        castShadow={castShadow}
        receiveShadow={receiveShadow}
      >
        <boxGeometry args={scale} />
        {material}
      </mesh>
    );
  }

  return (
    <RoundedBox
      args={scale}
      radius={radius}
      smoothness={3}
      position={position}
      rotation={rotation}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      {material}
    </RoundedBox>
  );
}

function WoodFloor() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 768;
    const context = canvas.getContext('2d');
    if (!context) return null;

    let seed = 41;
    const random = () => {
      seed = (seed * 16_807) % 2_147_483_647;
      return (seed - 1) / 2_147_483_646;
    };
    const rows = 14;
    const rowHeight = canvas.height / rows;
    const boardWidth = canvas.width / 4;
    context.fillStyle = '#9e7754';
    context.fillRect(0, 0, canvas.width, canvas.height);

    for (let row = 0; row < rows; row += 1) {
      const offset = row % 2 === 0 ? 0 : -boardWidth / 2;
      for (let column = -1; column < 5; column += 1) {
        const x = offset + column * boardWidth;
        const lightness = 47 + Math.round(random() * 7);
        context.fillStyle = `hsl(29 34% ${lightness}%)`;
        context.fillRect(x + 2, row * rowHeight + 2, boardWidth - 4, rowHeight - 4);

        context.strokeStyle = 'rgba(75, 47, 29, 0.16)';
        context.lineWidth = 1;
        for (let grain = 0; grain < 9; grain += 1) {
          const grainY = row * rowHeight + 8 + random() * (rowHeight - 16);
          context.beginPath();
          context.moveTo(x + 10, grainY);
          context.bezierCurveTo(
            x + boardWidth * 0.32,
            grainY + random() * 8 - 4,
            x + boardWidth * 0.7,
            grainY + random() * 8 - 4,
            x + boardWidth - 10,
            grainY,
          );
          context.stroke();
        }
      }
    }

    const floorTexture = new CanvasTexture(canvas);
    floorTexture.colorSpace = SRGBColorSpace;
    floorTexture.anisotropy = 8;
    return floorTexture;
  }, []);

  useEffect(
    () => () => {
      texture?.dispose();
    },
    [texture],
  );

  return (
    <mesh
      position={[0, 0.021, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[10, 8]} />
      <meshStandardMaterial map={texture} color="#ffffff" roughness={0.78} />
    </mesh>
  );
}

function Door({ open, reducedMotion }: { open: boolean; reducedMotion: boolean }) {
  const hinge = useRef<Group>(null);
  const target = open ? -Math.PI * 0.58 : 0;

  useFrame((_, delta) => {
    if (!hinge.current) return;
    hinge.current.rotation.y = reducedMotion
      ? target
      : MathUtils.damp(hinge.current.rotation.y, target, 6, delta);
  });

  return (
    <group position={[-4.78, 0, 2.85]} rotation={[0, Math.PI / 2, 0]}>
      <group ref={hinge}>
        <group position={[0.7, 1.15, 0]}>
          <Box
            position={[0, 0, 0]}
            scale={[1.4, 2.3, 0.12]}
            color="#765f4d"
            roughness={0.42}
            metalness={0.04}
          />
          <Box
            position={[0, 0, 0.07]}
            scale={[1.08, 1.96, 0.025]}
            color="#9a7d64"
            roughness={0.5}
          />
          <mesh position={[0.47, 0, 0.1]} castShadow>
            <sphereGeometry args={[0.07, 16, 16]} />
            <meshStandardMaterial color="#c8a45d" metalness={0.8} roughness={0.25} />
          </mesh>
        </group>
        <Html position={[0.7, 2.65, 0]} center distanceFactor={9}>
          <span className="pointer-events-none whitespace-nowrap rounded-full bg-white/90 px-2 py-1 text-[10px] font-bold text-ink shadow">
            Door {open ? 'open' : 'closed'}
          </span>
        </Html>
      </group>
    </group>
  );
}

function Lamp({
  position,
  on,
  disabled,
  onDeviceClick,
}: {
  position: [number, number, number];
  on: boolean;
  disabled: boolean;
  onDeviceClick: (key: SceneDeviceKey) => void;
}) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.48, 0]}>
        <cylinderGeometry args={[0.04, 0.06, 0.8, 14]} />
        <meshStandardMaterial color="#a48eaf" metalness={0.25} roughness={0.5} />
      </mesh>
      <mesh
        castShadow
        position={[0, 0.9, 0]}
        {...pointerHandlers('lights', disabled, onDeviceClick)}
      >
        <coneGeometry args={[0.3, 0.42, 24, 1, true]} />
        <meshStandardMaterial
          color={on ? '#fff4c4' : '#69636f'}
          emissive={on ? '#ffd77c' : '#000000'}
          emissiveIntensity={on ? 2.2 : 0}
          roughness={on ? 0.35 : 0.92}
          side={2}
        />
      </mesh>
      <mesh position={[0, 0.84, 0]}>
        <sphereGeometry args={[0.08, 16, 12]} />
        <meshStandardMaterial
          color={on ? '#fff8d8' : '#38343c'}
          emissive={on ? '#ffd36a' : '#000000'}
          emissiveIntensity={on ? 3.5 : 0}
          roughness={on ? 0.2 : 0.95}
        />
      </mesh>
      {on && (
        <pointLight
          position={[0, 0.82, 0]}
          intensity={2.2}
          distance={5}
          decay={2}
          color="#ffe5a1"
          castShadow
        />
      )}
    </group>
  );
}

function ExhaustFan({
  on,
  forced,
  disabled,
  reducedMotion,
  onDeviceClick,
}: {
  on: boolean;
  forced: boolean;
  disabled: boolean;
  reducedMotion: boolean;
  onDeviceClick: (key: SceneDeviceKey) => void;
}) {
  const blades = useRef<Group>(null);
  useFrame((_, delta) => {
    if (blades.current && on && !reducedMotion) blades.current.rotation.z -= delta * 9;
  });

  return (
    <group position={[-1.25, 2.35, -3.72]} rotation={[0, 0, 0]}>
      <mesh {...pointerHandlers('exhaustFan', disabled || forced, onDeviceClick)}>
        <cylinderGeometry args={[0.48, 0.48, 0.18, 32]} />
        <meshStandardMaterial color="#c9c3cf" roughness={0.45} metalness={0.35} />
      </mesh>
      <group ref={blades} position={[0, 0, 0.13]}>
        {[0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].map((rotation) => (
          <mesh key={rotation} rotation={[0, 0, rotation]} position={[0.22, 0, 0]}>
            <boxGeometry args={[0.38, 0.1, 0.05]} />
            <meshStandardMaterial
              color={forced ? '#d6453d' : on ? '#7c3aed' : '#807887'}
              emissive={forced ? '#8f1f1a' : '#000000'}
              emissiveIntensity={forced ? 1 : 0}
            />
          </mesh>
        ))}
      </group>
      <Html position={[0, 0.75, 0]} center distanceFactor={9}>
        <span
          className={`pointer-events-none whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold text-white shadow ${
            forced ? 'bg-alarm' : on ? 'bg-brand' : 'bg-ink-3'
          }`}
        >
          Fan {forced ? 'gas override' : on ? 'commanded on' : 'commanded off'}
        </span>
      </Html>
    </group>
  );
}

function WaterSystem({
  level,
  pumpOn,
  disabled,
  onDeviceClick,
}: {
  level: number;
  pumpOn: boolean;
  disabled: boolean;
  onDeviceClick: (key: SceneDeviceKey) => void;
}) {
  const fillHeight = Math.max(0.03, (level / 100) * 1.5);
  return (
    <group position={[5.9, 0, -2.05]}>
      <Box position={[0.35, 0.05, 0]} scale={[2.45, 0.1, 2.35]} color="#c7c1ca" />
      <mesh position={[1.2, 0.32, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 2.9, 16]} />
        <meshStandardMaterial color="#6b8f9b" metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.85, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.62, 0.62, 1.7, 32, 1, true]} />
        <meshPhysicalMaterial
          color="#d9edf5"
          transparent
          opacity={0.38}
          roughness={0.15}
          transmission={0.25}
          side={2}
        />
      </mesh>
      <mesh position={[0, 0.08 + fillHeight / 2, 0]}>
        <cylinderGeometry args={[0.56, 0.56, fillHeight, 32]} />
        <meshStandardMaterial color="#62b6cb" transparent opacity={0.82} />
      </mesh>
      <mesh
        position={[0.9, 0.28, 0]}
        castShadow
        {...pointerHandlers('waterPump', disabled, onDeviceClick)}
      >
        <boxGeometry args={[0.65, 0.55, 0.65]} />
        <meshStandardMaterial
          color={pumpOn ? '#6d5bd0' : '#77717e'}
          emissive={pumpOn ? '#3f2ca3' : '#000000'}
          emissiveIntensity={pumpOn ? 1.1 : 0}
          metalness={0.4}
          roughness={0.35}
        />
      </mesh>
      <Html position={[0.2, 2, 0]} center distanceFactor={9}>
        <span className="pointer-events-none whitespace-nowrap rounded-full bg-white/90 px-2 py-1 text-[10px] font-bold text-ink shadow">
          Tank {Math.round(level)}% · Pump commanded {pumpOn ? 'on' : 'off'}
        </span>
      </Html>
    </group>
  );
}

function Occupant({
  pose,
  reducedMotion,
}: {
  pose: OccupantPose;
  reducedMotion: boolean;
}) {
  const root = useRef<Group>(null);
  const gltf = useGLTF('/models/michelle.glb');
  const person = useMemo(() => {
    const cloned = cloneSkeleton(gltf.scene);
    cloned.traverse((node) => {
      if (node instanceof Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    const bounds = new Box3().setFromObject(cloned);
    if (!bounds.isEmpty()) cloned.position.y -= bounds.min.y;
    return cloned;
  }, [gltf.scene]);
  const { actions, names, mixer } = useAnimations(gltf.animations, root);
  const visible = pose !== 'absent';
  const placement = visible ? OCCUPANT_PLACEMENTS[pose] : OCCUPANT_PLACEMENTS.active;
  const target = useMemo(
    () => ({
      ...placement,
      position: new Vector3(...placement.position),
    }),
    [placement],
  );

  useLayoutEffect(() => {
    const group = root.current;
    if (!group) return;
    // Occupancy is discrete server truth, not a client-side path. Place the
    // avatar directly at the matching safe anchor so it never sweeps through
    // partitions while changing states.
    group.position.copy(target.position);
    group.rotation.set(0, target.rotationY, target.rotationZ);
    group.scale.setScalar(target.scale);
  }, [target]);

  useEffect(() => {
    const clipName = names.includes('SambaDance') ? 'SambaDance' : names[0];
    const action = clipName ? actions[clipName] : undefined;
    if (!action) return;
    const timeScale = pose === 'active' && !reducedMotion ? 0.18 : 0;
    action.reset().setEffectiveTimeScale(timeScale).fadeIn(0.2).play();
    if (timeScale === 0) {
      const phase =
        pose === 'sleeping' ? 0.42 : pose === 'idle' ? 0.12 : 0.04;
      mixer.setTime(action.getClip().duration * phase);
    }
    return () => {
      action.fadeOut(0.15);
    };
  }, [actions, mixer, names, pose, reducedMotion]);

  return (
    <group ref={root} visible={visible}>
      <primitive object={person} />
      {visible && (
        <Html position={[0, 2.25, 0]} center distanceFactor={10}>
          <span className="pointer-events-none whitespace-nowrap rounded-full bg-brand/90 px-2 py-1 text-[10px] font-bold capitalize text-white shadow">
            {pose}
          </span>
        </Html>
      )}
    </group>
  );
}

function Armchair({
  position,
  rotationY,
}: {
  position: [number, number, number];
  rotationY: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Box position={[0, 0.38, 0]} scale={[0.95, 0.34, 0.88]} color="#99859d" roughness={0.94} rounded />
      <Box position={[0, 0.82, 0.34]} scale={[0.95, 0.72, 0.2]} color="#89778e" roughness={0.95} rounded />
      <Box position={[-0.5, 0.55, 0]} scale={[0.16, 0.55, 0.92]} color="#89778e" roughness={0.95} rounded />
      <Box position={[0.5, 0.55, 0]} scale={[0.16, 0.55, 0.92]} color="#89778e" roughness={0.95} rounded />
      <Box position={[0, 0.6, -0.02]} scale={[0.78, 0.22, 0.66]} color="#ad9ab0" roughness={0.98} rounded />
    </group>
  );
}

function Television({ on }: { on: boolean }) {
  return (
    <group position={[-0.04, 1.32, 0.42]}>
      <mesh castShadow>
        <boxGeometry args={[0.075, 1.3, 1.7]} />
        <meshPhysicalMaterial
          color={on ? '#102735' : '#07070a'}
          emissive={on ? '#174b67' : '#000000'}
          emissiveIntensity={on ? 1.15 : 0}
          roughness={on ? 0.28 : 0.58}
          metalness={0.18}
          clearcoat={on ? 0.22 : 0.08}
          clearcoatRoughness={0.25}
        />
      </mesh>
      {on && (
        <>
          <mesh position={[0.041, 0.1, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[1.5, 1.08]} />
            <meshStandardMaterial
              color="#2d6681"
              emissive="#2a6f91"
              emissiveIntensity={0.9}
              roughness={0.42}
            />
          </mesh>
          <mesh position={[0.044, -0.26, 0.25]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[0.48, 0.24]} />
            <meshStandardMaterial
              color="#d7a85f"
              emissive="#a86c2b"
              emissiveIntensity={0.48}
            />
          </mesh>
          <pointLight
            position={[0.4, 0, 0]}
            color="#7bc8ed"
            intensity={0.7}
            distance={2.4}
            decay={2}
          />
        </>
      )}
      <Html position={[0.05, 0.86, 0]} center distanceFactor={10}>
        <span className="pointer-events-none whitespace-nowrap rounded-full bg-white/90 px-2 py-1 text-[9px] font-bold text-ink shadow">
          TV presence cue {on ? 'on' : 'off'} · visual only
        </span>
      </Html>
    </group>
  );
}

function Furniture({ tvPresenceCueOn }: { tvPresenceCueOn: boolean }) {
  return (
    <>
      {/* Layered rugs soften the bedroom and lounge zones. */}
      <Box position={[2.65, 0.065, -1.02]} scale={[4.05, 0.045, 3.2]} color="#8d7697" roughness={0.95} rounded />
      <Box position={[0.55, 0.065, 2.45]} scale={[4.7, 0.04, 2.25]} color="#c2b2c8" roughness={0.98} rounded />

      {/* Bed */}
      <Box position={[2.65, 0.28, -1.05]} scale={[3.15, 0.45, 2.45]} color="#d7cedf" />
      <Box position={[2.65, 0.62, -1.05]} scale={[3, 0.25, 2.3]} color="#f7f5f8" rounded />
      <Box position={[2.65, 0.94, -1.94]} scale={[2.9, 0.48, 0.42]} color="#aa94b5" rounded />
      <Box position={[2.05, 0.86, -1.45]} scale={[0.9, 0.18, 0.55]} color="#ffffff" rounded />
      <Box position={[3.18, 0.86, -1.45]} scale={[0.9, 0.18, 0.55]} color="#ffffff" rounded />
      <Box position={[2.65, 0.81, -0.62]} scale={[2.9, 0.16, 1.08]} color="#bca8c4" roughness={0.92} rounded />
      <Box position={[0.82, 0.42, -1.55]} scale={[0.6, 0.82, 0.62]} color="#b79c83" />
      <Box position={[4.48, 0.42, -1.55]} scale={[0.6, 0.82, 0.62]} color="#b79c83" />

      {/* Living room: sofa, two lounge chairs, coffee table and console */}
      <Box position={[1.95, 0.42, 2.75]} scale={[2.55, 0.62, 0.9]} color="#8f7d91" roughness={0.95} rounded />
      <Box position={[1.95, 0.9, 3.08]} scale={[2.52, 0.82, 0.18]} color="#7f6e82" roughness={0.96} rounded />
      <Box position={[1.45, 0.7, 2.62]} scale={[0.9, 0.24, 0.7]} color="#aa96ad" roughness={0.98} rounded />
      <Box position={[2.43, 0.7, 2.62]} scale={[0.9, 0.24, 0.7]} color="#a18da4" roughness={0.98} rounded />
      <Box position={[0.95, 0.92, 3]} scale={[0.38, 1.1, 0.45]} color="#8c779c" rounded />
      <Box position={[2.95, 0.92, 3]} scale={[0.38, 1.1, 0.45]} color="#8c779c" rounded />
      <Armchair position={[-0.45, 0, 2.6]} rotationY={0.45} />
      <Armchair position={[-1.65, 0, 3.15]} rotationY={-0.35} />
      <Box position={[0.05, 0.3, 2.05]} scale={[1.35, 0.15, 0.8]} color="#b69370" />
      <Box position={[-0.45, 0.14, 2.05]} scale={[0.1, 0.28, 0.1]} color="#6c5b50" />
      <Box position={[0.55, 0.14, 2.05]} scale={[0.1, 0.28, 0.1]} color="#6c5b50" />

      {/* Entry wardrobe and television divider, matching the former 2.5D suite */}
      <Box position={[-4.15, 1.2, 1.05]} scale={[1.05, 2.4, 1.85]} color="#b79c83" />
      <Box position={[-4.13, 1.22, 0.68]} scale={[1.08, 2.1, 0.04]} color="#9c8068" roughness={0.5} />
      <Box position={[-4.13, 1.22, 1.43]} scale={[1.08, 2.1, 0.04]} color="#a98b70" roughness={0.5} />
      <Box position={[-0.15, 1.32, 0.42]} scale={[0.16, 2.65, 2.4]} color="#eee9ef" />
      <Television on={tvPresenceCueOn} />
      <Box position={[-0.02, 0.42, 0.42]} scale={[0.55, 0.55, 2.55]} color="#b79c83" />

      {/* Soft curtains framing the bedroom windows. */}
      {[0.78, 1.08, 3.52, 3.82].map((x, index) => (
        <Box
          key={x}
          position={[x, 1.55, -3.67]}
          scale={[0.24, 2.55, 0.12]}
          color={index % 2 === 0 ? '#8c7b91' : '#d8d1d9'}
          roughness={0.98}
        />
      ))}
    </>
  );
}

function Bathroom() {
  return (
    <group>
      <Box position={[-2.55, 0.04, -2.7]} scale={[4.5, 0.08, 2.25]} color="#ded9d1" />
      {/* Rear bathroom shell and partition */}
      <Box position={[-2.55, 0.72, -1.55]} scale={[4.55, 1.44, 0.16]} color="#eee9ef" />
      <Box position={[-0.22, 0.72, -2.72]} scale={[0.16, 1.44, 2.5]} color="#eee9ef" />

      {/* Glass shower enclosure */}
      <mesh position={[-3.75, 1.05, -2.7]} receiveShadow>
        <boxGeometry args={[1.6, 2.1, 1.55]} />
        <meshPhysicalMaterial
          color="#d8edf2"
          transparent
          opacity={0.2}
          roughness={0.08}
          transmission={0.55}
          side={2}
        />
      </mesh>
      <mesh position={[-3.75, 1.7, -3.48]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.025, 12, 28, Math.PI]} />
        <meshStandardMaterial color="#8b9098" metalness={0.75} roughness={0.25} />
      </mesh>

      {/* Vanity, two basins, mirrors and toilet */}
      <Box position={[-1.5, 0.62, -3.45]} scale={[2.1, 0.85, 0.65]} color="#b79c83" />
      {[-2, -1].map((x) => (
        <group key={x}>
          <mesh position={[x, 1.08, -3.43]} castShadow>
            <cylinderGeometry args={[0.28, 0.24, 0.14, 24]} />
            <meshStandardMaterial color="#f7f6f4" roughness={0.25} />
          </mesh>
          <Box position={[x, 1.9, -3.72]} scale={[0.65, 0.9, 0.05]} color="#c7dce3" />
        </group>
      ))}
      <mesh position={[-0.68, 0.45, -2.55]} castShadow>
        <cylinderGeometry args={[0.34, 0.3, 0.65, 24]} />
        <meshStandardMaterial color="#f5f3f1" roughness={0.3} />
      </mesh>

      {/* Bathtub beside the bedroom divider */}
      <Box position={[-1.5, 0.42, -1.98]} scale={[2.1, 0.72, 0.82]} color="#f2f0f3" rounded />
      <Box position={[-1.5, 0.67, -1.98]} scale={[1.72, 0.18, 0.55]} color="#c9e3eb" rounded />
    </group>
  );
}

function Room({
  state,
  reducedMotion,
  disabled,
  onDeviceClick,
}: {
  state: RoomSceneState;
  reducedMotion: boolean;
  disabled: boolean;
  onDeviceClick: (key: SceneDeviceKey) => void;
}) {
  const ambientColor = useMemo(
    () => new Color(state.lightsOn ? '#fff6df' : '#bbb1c6'),
    [state.lightsOn],
  );

  return (
    <>
      <color attach="background" args={[state.online ? '#eeeaf3' : '#d9d7dc']} />
      <hemisphereLight args={['#f9f5ef', '#756a64', state.lightsOn ? 0.72 : 0.42]} />
      <ambientLight color={ambientColor} intensity={state.lightsOn ? 0.76 : 0.38} />
      <directionalLight
        position={[4, 9, 6]}
        intensity={state.lightsOn ? 1.05 : 0.62}
        color="#fff8ed"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
      />
      {state.gasAlarm && (
        <pointLight position={[-1.25, 2.3, -3]} color="#d6453d" intensity={3} distance={4} />
      )}

      {/* Floor and open dollhouse walls */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.75, -0.06, -0.25]} receiveShadow>
        <planeGeometry args={[14.5, 10.5]} />
        <meshStandardMaterial color="#ded9e1" roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 8]} />
        <meshStandardMaterial color="#9b7c61" roughness={0.88} />
      </mesh>
      <WoodFloor />
      <Box position={[-4.7, 1.5, -3.9]} scale={[0.6, 3, 0.18]} color="#eee9ef" />
      <Box position={[-1.1, 1.5, -3.9]} scale={[5.1, 3, 0.18]} color="#eee9ef" />
      <Box position={[3.85, 1.5, -3.9]} scale={[2.3, 3, 0.18]} color="#e7dfea" />
      <Box position={[-4.9, 1.5, -1.3]} scale={[0.18, 3, 5.4]} color="#f1edf2" />
      <Box position={[-4.9, 1.5, 3.45]} scale={[0.18, 3, 1.1]} color="#f1edf2" />

      {/* Windows */}
      {[1.4, 3.2].map((x) => (
        <mesh key={x} position={[x, 1.75, -3.78]}>
          <boxGeometry args={[1.2, 1.45, 0.05]} />
          <meshStandardMaterial
            color="#c8e5f0"
            emissive="#b6dbe8"
            emissiveIntensity={0.45}
            metalness={0.1}
            roughness={0.15}
          />
        </mesh>
      ))}

      <Door open={state.doorOpen} reducedMotion={reducedMotion} />
      <Furniture tvPresenceCueOn={state.tvPresenceCueOn} />
      <Bathroom />
      <Lamp
        position={[1.05, 0, -0.8]}
        on={state.lightsOn}
        disabled={disabled}
        onDeviceClick={onDeviceClick}
      />
      <Lamp
        position={[3.75, 0, -0.8]}
        on={state.lightsOn}
        disabled={disabled}
        onDeviceClick={onDeviceClick}
      />
      <ExhaustFan
        on={state.fanOn}
        forced={state.fanForcedByGas}
        disabled={disabled}
        reducedMotion={reducedMotion}
        onDeviceClick={onDeviceClick}
      />
      <WaterSystem
        level={state.waterLevel}
        pumpOn={state.pumpOn}
        disabled={disabled}
        onDeviceClick={onDeviceClick}
      />
      <Suspense fallback={null}>
        <Occupant pose={state.occupantPose} reducedMotion={reducedMotion} />
      </Suspense>
      <ContactShadows
        position={[0, 0.015, 0]}
        opacity={0.42}
        scale={12}
        blur={2.5}
        far={8}
      />
    </>
  );
}

function ResponsiveCamera() {
  const { size } = useThree();
  const aspect = size.width / Math.max(1, size.height);
  const fov = aspect < 0.8 ? 52 : aspect < 1.25 ? 46 : 40;
  return (
    <DreiPerspectiveCamera
      makeDefault
      position={[11.5, 11.5, 13]}
      fov={fov}
      near={0.1}
      far={100}
    />
  );
}

export function RoomScene3D({
  state,
  reducedMotion,
  controlsDisabled,
  pendingDevice,
  onDeviceClick,
}: {
  state: RoomSceneState;
  reducedMotion: boolean;
  controlsDisabled: boolean;
  pendingDevice?: SceneDeviceKey;
  onDeviceClick: (key: SceneDeviceKey) => void;
}) {
  useEffect(() => {
    const previousCursor = document.body.style.cursor;
    return () => {
      document.body.style.cursor = previousCursor;
    };
  }, []);

  return (
    <Canvas
      shadows="basic"
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      aria-label="Interactive 3D room digital twin"
      data-pending-device={pendingDevice}
    >
      <ResponsiveCamera />
      <Room
        state={state}
        reducedMotion={reducedMotion}
        disabled={controlsDisabled || pendingDevice !== undefined}
        onDeviceClick={onDeviceClick}
      />
      <OrbitControls
        makeDefault
        target={[0, 0.55, 0]}
        enablePan={false}
        enableDamping={!reducedMotion}
        minDistance={9}
        maxDistance={21}
        minPolarAngle={0.58}
        maxPolarAngle={1.28}
        minAzimuthAngle={-1.2}
        maxAzimuthAngle={1.2}
      />
    </Canvas>
  );
}

useGLTF.preload('/models/michelle.glb');
