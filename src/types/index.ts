import { CustomArtifactType, CustomLibType } from '@/types/Custom';
import Fields from '@/types/Fields';
import Options from '@/types/Options';
import User from '@/types/User';
import Version from '@/types/Version';

export type OS = 'windows' | 'osx' | 'linux';

export type Rule = {
    action: string;
    features: Record<string, boolean>;
};

export type ArtifactType = {
    path: string;
    sha1: string;
    size: number;
    url: string;
};

export type LibType = {
    downloads: {
        artifact: ArtifactType;
        classifiers?: {
            'natives-linux'?: ArtifactType;
            'natives-osx'?: ArtifactType;
            'natives-macos'?: ArtifactType;
            'natives-windows'?: ArtifactType;
            'natives-windows-64'?: ArtifactType;
            'natives-windows-32'?: ArtifactType;
        };
    };
    name: string;
    rules?: {
        action: 'allow' | 'disallow';
        os: {
            name?: string;
        };
    }[];
};

export type { Version, User, CustomArtifactType, CustomLibType, Fields, Options };
