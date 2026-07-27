'use client';

import { ContactShadows, Html, OrbitControls, useAnimations, useGLTF } from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import {
  Box3,
  Color,
  Group,
  MathUtils,
  Mesh,
  Vector3,
} from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { DeviceCommandKey } from '@/telemetry/contract';
import type { OccupantPose, RoomSceneState } from './room-scene-state';

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
  color,
  roughness = 0.7,
  metalness = 0,
  castShadow = true,
  receiveShadow = true,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  roughness?: number;
  metalness?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  return (
    <mesh position={position} castShadow={castShadow} receiveShadow={receiveShadow}>
      <boxGeometry args={scale} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
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
    <group ref={hinge} position={[-4.35, 0, -3.86]}>
      <group position={[0.7, 1.15, 0]}>
        <Box
          position={[0, 0, 0]}
          scale={[1.4, 2.3, 0.12]}
          color="#8f789f"
          roughness={0.55}
        />
        <mesh position={[0.47, 0, 0.08]} castShadow>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial color="#d7b86b" metalness={0.8} roughness={0.25} />
        </mesh>
      </group>
      <Html position={[0.7, 2.65, 0]} center distanceFactor={9}>
        <span className="pointer-events-none whitespace-nowrap rounded-full bg-white/90 px-2 py-1 text-[10px] font-bold text-ink shadow">
          Door {open ? 'open' : 'closed'}
        </span>
      </Html>
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
          color={on ? '#fff4c4' : '#d8cedd'}
          emissive={on ? '#ffd77c' : '#000000'}
          emissiveIntensity={on ? 2.2 : 0}
          side={2}
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
    <group position={[-3.55, 0, -1.65]}>
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

const POSE_TARGETS: Record<
  Exclude<OccupantPose, 'absent'>,
  { position: Vector3; rotationY: number; rotationZ: number; scale: number }
> = {
  entering: {
    position: new Vector3(-3.35, 0, -2.65),
    rotationY: 0.75,
    rotationZ: 0,
    scale: 0.82,
  },
  active: {
    position: new Vector3(-0.45, 0, 0.3),
    rotationY: 0.35,
    rotationZ: 0,
    scale: 0.82,
  },
  idle: {
    position: new Vector3(-1.85, 0.38, 2.2),
    rotationY: -0.6,
    rotationZ: 0,
    scale: 0.72,
  },
  sleeping: {
    position: new Vector3(2.35, 1.12, -0.25),
    rotationY: -0.25,
    rotationZ: -Math.PI / 2,
    scale: 0.78,
  },
  exiting: {
    position: new Vector3(-3.75, 0, -2.82),
    rotationY: -2.15,
    rotationZ: 0,
    scale: 0.82,
  },
};

function Occupant({
  pose,
  reducedMotion,
}: {
  pose: OccupantPose;
  reducedMotion: boolean;
}) {
  const root = useRef<Group>(null);
  const gltf = useGLTF('/models/cesium-man.glb');
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
  const { actions, names } = useAnimations(gltf.animations, root);
  const visible = pose !== 'absent';
  const target = visible ? POSE_TARGETS[pose] : POSE_TARGETS.active;

  useEffect(() => {
    const action = names[0] ? actions[names[0]] : undefined;
    if (!action) return;
    const timeScale =
      pose === 'idle' || pose === 'sleeping' || reducedMotion
        ? 0
        : pose === 'active'
          ? 0.45
          : 0.8;
    action.reset().setEffectiveTimeScale(timeScale).fadeIn(0.2).play();
    return () => {
      action.fadeOut(0.15);
    };
  }, [actions, names, pose, reducedMotion]);

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;
    const factor = reducedMotion ? 1 : 1 - Math.exp(-delta * 3.5);
    group.position.lerp(target.position, factor);
    group.rotation.y = reducedMotion
      ? target.rotationY
      : MathUtils.damp(group.rotation.y, target.rotationY, 4, delta);
    group.rotation.z = reducedMotion
      ? target.rotationZ
      : MathUtils.damp(group.rotation.z, target.rotationZ, 4, delta);
    const nextScale = reducedMotion
      ? target.scale
      : MathUtils.damp(group.scale.x, target.scale, 4, delta);
    group.scale.setScalar(nextScale);
  });

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

function Furniture() {
  return (
    <>
      {/* Bed */}
      <Box position={[2.35, 0.28, -0.15]} scale={[3.1, 0.45, 2.45]} color="#d7cedf" />
      <Box position={[2.35, 0.62, -0.15]} scale={[2.95, 0.25, 2.3]} color="#f7f5f8" />
      <Box position={[2.35, 0.93, -1.02]} scale={[2.85, 0.45, 0.45]} color="#aa94b5" />
      <Box position={[1.75, 0.85, -0.55]} scale={[0.9, 0.18, 0.55]} color="#ffffff" />
      <Box position={[2.88, 0.85, -0.55]} scale={[0.9, 0.18, 0.55]} color="#ffffff" />

      {/* Sofa and coffee table */}
      <Box position={[-1.85, 0.45, 2.45]} scale={[2.35, 0.7, 0.9]} color="#9f8cac" />
      <Box position={[-2.75, 0.92, 2.7]} scale={[0.38, 1.1, 0.45]} color="#8c779c" />
      <Box position={[-0.95, 0.92, 2.7]} scale={[0.38, 1.1, 0.45]} color="#8c779c" />
      <Box position={[0.05, 0.3, 2.1]} scale={[1.1, 0.15, 0.75]} color="#b69370" />
      <Box position={[-0.35, 0.14, 2.1]} scale={[0.1, 0.28, 0.1]} color="#6c5b50" />
      <Box position={[0.45, 0.14, 2.1]} scale={[0.1, 0.28, 0.1]} color="#6c5b50" />

      {/* Wardrobe and television */}
      <Box position={[-4.25, 1.2, 1.4]} scale={[0.95, 2.4, 1.6]} color="#b79c83" />
      <Box position={[0.1, 1.25, -3.72]} scale={[2.25, 1.25, 0.16]} color="#24202a" roughness={0.25} />
      <Box position={[0.1, 0.45, -3.45]} scale={[2.7, 0.55, 0.65]} color="#b79c83" />
    </>
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
      <ambientLight color={ambientColor} intensity={state.lightsOn ? 1.55 : 0.72} />
      <directionalLight
        position={[4, 9, 6]}
        intensity={state.lightsOn ? 1.25 : 0.72}
        color="#fff8ed"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      {state.gasAlarm && (
        <pointLight position={[-1.25, 2.3, -3]} color="#d6453d" intensity={3} distance={4} />
      )}

      {/* Floor and open dollhouse walls */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 8]} />
        <meshStandardMaterial color="#cdbda9" roughness={0.82} />
      </mesh>
      <Box position={[-4.7, 1.5, -3.9]} scale={[0.6, 3, 0.18]} color="#eee9ef" />
      <Box position={[-1.1, 1.5, -3.9]} scale={[5.1, 3, 0.18]} color="#eee9ef" />
      <Box position={[3.85, 1.5, -3.9]} scale={[2.3, 3, 0.18]} color="#e7dfea" />
      <Box position={[-4.9, 1.5, 0]} scale={[0.18, 3, 8]} color="#f1edf2" />

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
      <Furniture />
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
      camera={{ position: [10.5, 9, 11.5], fov: 42, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      aria-label="Interactive 3D room digital twin"
      data-pending-device={pendingDevice}
    >
      <Room
        state={state}
        reducedMotion={reducedMotion}
        disabled={controlsDisabled || pendingDevice !== undefined}
        onDeviceClick={onDeviceClick}
      />
      <OrbitControls
        makeDefault
        target={[0, 0.75, 0]}
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

useGLTF.preload('/models/cesium-man.glb');
