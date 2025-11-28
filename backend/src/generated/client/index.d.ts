
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model Collection
 * 
 */
export type Collection = $Result.DefaultSelection<Prisma.$CollectionPayload>
/**
 * Model Drawing
 * 
 */
export type Drawing = $Result.DefaultSelection<Prisma.$DrawingPayload>
/**
 * Model PrivateVault
 * 
 */
export type PrivateVault = $Result.DefaultSelection<Prisma.$PrivateVaultPayload>
/**
 * Model Library
 * 
 */
export type Library = $Result.DefaultSelection<Prisma.$LibraryPayload>

/**
 * ##  Prisma Client ʲˢ
 * 
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Collections
 * const collections = await prisma.collection.findMany()
 * ```
 *
 * 
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   * 
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Collections
   * const collections = await prisma.collection.findMany()
   * ```
   *
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): void;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

  /**
   * Add a middleware
   * @deprecated since 4.16.0. For new code, prefer client extensions instead.
   * @see https://pris.ly/d/extensions
   */
  $use(cb: Prisma.Middleware): void

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb, ExtArgs>

      /**
   * `prisma.collection`: Exposes CRUD operations for the **Collection** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Collections
    * const collections = await prisma.collection.findMany()
    * ```
    */
  get collection(): Prisma.CollectionDelegate<ExtArgs>;

  /**
   * `prisma.drawing`: Exposes CRUD operations for the **Drawing** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Drawings
    * const drawings = await prisma.drawing.findMany()
    * ```
    */
  get drawing(): Prisma.DrawingDelegate<ExtArgs>;

  /**
   * `prisma.privateVault`: Exposes CRUD operations for the **PrivateVault** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more PrivateVaults
    * const privateVaults = await prisma.privateVault.findMany()
    * ```
    */
  get privateVault(): Prisma.PrivateVaultDelegate<ExtArgs>;

  /**
   * `prisma.library`: Exposes CRUD operations for the **Library** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Libraries
    * const libraries = await prisma.library.findMany()
    * ```
    */
  get library(): Prisma.LibraryDelegate<ExtArgs>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError
  export import NotFoundError = runtime.NotFoundError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics 
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 5.22.0
   * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion 

  /**
   * Utility Types
   */


  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? K : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    Collection: 'Collection',
    Drawing: 'Drawing',
    PrivateVault: 'PrivateVault',
    Library: 'Library'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb extends $Utils.Fn<{extArgs: $Extensions.InternalArgs, clientOptions: PrismaClientOptions }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], this['params']['clientOptions']>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> = {
    meta: {
      modelProps: "collection" | "drawing" | "privateVault" | "library"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      Collection: {
        payload: Prisma.$CollectionPayload<ExtArgs>
        fields: Prisma.CollectionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.CollectionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollectionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.CollectionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollectionPayload>
          }
          findFirst: {
            args: Prisma.CollectionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollectionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.CollectionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollectionPayload>
          }
          findMany: {
            args: Prisma.CollectionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollectionPayload>[]
          }
          create: {
            args: Prisma.CollectionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollectionPayload>
          }
          createMany: {
            args: Prisma.CollectionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.CollectionCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollectionPayload>[]
          }
          delete: {
            args: Prisma.CollectionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollectionPayload>
          }
          update: {
            args: Prisma.CollectionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollectionPayload>
          }
          deleteMany: {
            args: Prisma.CollectionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.CollectionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.CollectionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollectionPayload>
          }
          aggregate: {
            args: Prisma.CollectionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateCollection>
          }
          groupBy: {
            args: Prisma.CollectionGroupByArgs<ExtArgs>
            result: $Utils.Optional<CollectionGroupByOutputType>[]
          }
          count: {
            args: Prisma.CollectionCountArgs<ExtArgs>
            result: $Utils.Optional<CollectionCountAggregateOutputType> | number
          }
        }
      }
      Drawing: {
        payload: Prisma.$DrawingPayload<ExtArgs>
        fields: Prisma.DrawingFieldRefs
        operations: {
          findUnique: {
            args: Prisma.DrawingFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DrawingPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.DrawingFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DrawingPayload>
          }
          findFirst: {
            args: Prisma.DrawingFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DrawingPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.DrawingFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DrawingPayload>
          }
          findMany: {
            args: Prisma.DrawingFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DrawingPayload>[]
          }
          create: {
            args: Prisma.DrawingCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DrawingPayload>
          }
          createMany: {
            args: Prisma.DrawingCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.DrawingCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DrawingPayload>[]
          }
          delete: {
            args: Prisma.DrawingDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DrawingPayload>
          }
          update: {
            args: Prisma.DrawingUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DrawingPayload>
          }
          deleteMany: {
            args: Prisma.DrawingDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.DrawingUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.DrawingUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DrawingPayload>
          }
          aggregate: {
            args: Prisma.DrawingAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateDrawing>
          }
          groupBy: {
            args: Prisma.DrawingGroupByArgs<ExtArgs>
            result: $Utils.Optional<DrawingGroupByOutputType>[]
          }
          count: {
            args: Prisma.DrawingCountArgs<ExtArgs>
            result: $Utils.Optional<DrawingCountAggregateOutputType> | number
          }
        }
      }
      PrivateVault: {
        payload: Prisma.$PrivateVaultPayload<ExtArgs>
        fields: Prisma.PrivateVaultFieldRefs
        operations: {
          findUnique: {
            args: Prisma.PrivateVaultFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivateVaultPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.PrivateVaultFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivateVaultPayload>
          }
          findFirst: {
            args: Prisma.PrivateVaultFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivateVaultPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.PrivateVaultFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivateVaultPayload>
          }
          findMany: {
            args: Prisma.PrivateVaultFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivateVaultPayload>[]
          }
          create: {
            args: Prisma.PrivateVaultCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivateVaultPayload>
          }
          createMany: {
            args: Prisma.PrivateVaultCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.PrivateVaultCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivateVaultPayload>[]
          }
          delete: {
            args: Prisma.PrivateVaultDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivateVaultPayload>
          }
          update: {
            args: Prisma.PrivateVaultUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivateVaultPayload>
          }
          deleteMany: {
            args: Prisma.PrivateVaultDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.PrivateVaultUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.PrivateVaultUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivateVaultPayload>
          }
          aggregate: {
            args: Prisma.PrivateVaultAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregatePrivateVault>
          }
          groupBy: {
            args: Prisma.PrivateVaultGroupByArgs<ExtArgs>
            result: $Utils.Optional<PrivateVaultGroupByOutputType>[]
          }
          count: {
            args: Prisma.PrivateVaultCountArgs<ExtArgs>
            result: $Utils.Optional<PrivateVaultCountAggregateOutputType> | number
          }
        }
      }
      Library: {
        payload: Prisma.$LibraryPayload<ExtArgs>
        fields: Prisma.LibraryFieldRefs
        operations: {
          findUnique: {
            args: Prisma.LibraryFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LibraryPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.LibraryFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LibraryPayload>
          }
          findFirst: {
            args: Prisma.LibraryFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LibraryPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.LibraryFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LibraryPayload>
          }
          findMany: {
            args: Prisma.LibraryFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LibraryPayload>[]
          }
          create: {
            args: Prisma.LibraryCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LibraryPayload>
          }
          createMany: {
            args: Prisma.LibraryCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.LibraryCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LibraryPayload>[]
          }
          delete: {
            args: Prisma.LibraryDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LibraryPayload>
          }
          update: {
            args: Prisma.LibraryUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LibraryPayload>
          }
          deleteMany: {
            args: Prisma.LibraryDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.LibraryUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.LibraryUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LibraryPayload>
          }
          aggregate: {
            args: Prisma.LibraryAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateLibrary>
          }
          groupBy: {
            args: Prisma.LibraryGroupByArgs<ExtArgs>
            result: $Utils.Optional<LibraryGroupByOutputType>[]
          }
          count: {
            args: Prisma.LibraryCountArgs<ExtArgs>
            result: $Utils.Optional<LibraryCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Defaults to stdout
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events
     * log: [
     *   { emit: 'stdout', level: 'query' },
     *   { emit: 'stdout', level: 'info' },
     *   { emit: 'stdout', level: 'warn' }
     *   { emit: 'stdout', level: 'error' }
     * ]
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
  }


  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type GetLogType<T extends LogLevel | LogDefinition> = T extends LogDefinition ? T['emit'] extends 'event' ? T['level'] : never : never
  export type GetEvents<T extends any> = T extends Array<LogLevel | LogDefinition> ?
    GetLogType<T[0]> | GetLogType<T[1]> | GetLogType<T[2]> | GetLogType<T[3]>
    : never

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  /**
   * These options are being passed into the middleware as "params"
   */
  export type MiddlewareParams = {
    model?: ModelName
    action: PrismaAction
    args: any
    dataPath: string[]
    runInTransaction: boolean
  }

  /**
   * The `T` type makes sure, that the `return proceed` is not forgotten in the middleware implementation
   */
  export type Middleware<T = any> = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => $Utils.JsPromise<T>,
  ) => $Utils.JsPromise<T>

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type CollectionCountOutputType
   */

  export type CollectionCountOutputType = {
    drawings: number
  }

  export type CollectionCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    drawings?: boolean | CollectionCountOutputTypeCountDrawingsArgs
  }

  // Custom InputTypes
  /**
   * CollectionCountOutputType without action
   */
  export type CollectionCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CollectionCountOutputType
     */
    select?: CollectionCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * CollectionCountOutputType without action
   */
  export type CollectionCountOutputTypeCountDrawingsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: DrawingWhereInput
  }


  /**
   * Models
   */

  /**
   * Model Collection
   */

  export type AggregateCollection = {
    _count: CollectionCountAggregateOutputType | null
    _min: CollectionMinAggregateOutputType | null
    _max: CollectionMaxAggregateOutputType | null
  }

  export type CollectionMinAggregateOutputType = {
    id: string | null
    name: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type CollectionMaxAggregateOutputType = {
    id: string | null
    name: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type CollectionCountAggregateOutputType = {
    id: number
    name: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type CollectionMinAggregateInputType = {
    id?: true
    name?: true
    createdAt?: true
    updatedAt?: true
  }

  export type CollectionMaxAggregateInputType = {
    id?: true
    name?: true
    createdAt?: true
    updatedAt?: true
  }

  export type CollectionCountAggregateInputType = {
    id?: true
    name?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type CollectionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Collection to aggregate.
     */
    where?: CollectionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Collections to fetch.
     */
    orderBy?: CollectionOrderByWithRelationInput | CollectionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: CollectionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Collections from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Collections.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Collections
    **/
    _count?: true | CollectionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: CollectionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: CollectionMaxAggregateInputType
  }

  export type GetCollectionAggregateType<T extends CollectionAggregateArgs> = {
        [P in keyof T & keyof AggregateCollection]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateCollection[P]>
      : GetScalarType<T[P], AggregateCollection[P]>
  }




  export type CollectionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CollectionWhereInput
    orderBy?: CollectionOrderByWithAggregationInput | CollectionOrderByWithAggregationInput[]
    by: CollectionScalarFieldEnum[] | CollectionScalarFieldEnum
    having?: CollectionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: CollectionCountAggregateInputType | true
    _min?: CollectionMinAggregateInputType
    _max?: CollectionMaxAggregateInputType
  }

  export type CollectionGroupByOutputType = {
    id: string
    name: string
    createdAt: Date
    updatedAt: Date
    _count: CollectionCountAggregateOutputType | null
    _min: CollectionMinAggregateOutputType | null
    _max: CollectionMaxAggregateOutputType | null
  }

  type GetCollectionGroupByPayload<T extends CollectionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<CollectionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof CollectionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], CollectionGroupByOutputType[P]>
            : GetScalarType<T[P], CollectionGroupByOutputType[P]>
        }
      >
    >


  export type CollectionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    drawings?: boolean | Collection$drawingsArgs<ExtArgs>
    _count?: boolean | CollectionCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["collection"]>

  export type CollectionSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["collection"]>

  export type CollectionSelectScalar = {
    id?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type CollectionInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    drawings?: boolean | Collection$drawingsArgs<ExtArgs>
    _count?: boolean | CollectionCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type CollectionIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $CollectionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Collection"
    objects: {
      drawings: Prisma.$DrawingPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      name: string
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["collection"]>
    composites: {}
  }

  type CollectionGetPayload<S extends boolean | null | undefined | CollectionDefaultArgs> = $Result.GetResult<Prisma.$CollectionPayload, S>

  type CollectionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<CollectionFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: CollectionCountAggregateInputType | true
    }

  export interface CollectionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Collection'], meta: { name: 'Collection' } }
    /**
     * Find zero or one Collection that matches the filter.
     * @param {CollectionFindUniqueArgs} args - Arguments to find a Collection
     * @example
     * // Get one Collection
     * const collection = await prisma.collection.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends CollectionFindUniqueArgs>(args: SelectSubset<T, CollectionFindUniqueArgs<ExtArgs>>): Prisma__CollectionClient<$Result.GetResult<Prisma.$CollectionPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one Collection that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {CollectionFindUniqueOrThrowArgs} args - Arguments to find a Collection
     * @example
     * // Get one Collection
     * const collection = await prisma.collection.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends CollectionFindUniqueOrThrowArgs>(args: SelectSubset<T, CollectionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__CollectionClient<$Result.GetResult<Prisma.$CollectionPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first Collection that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CollectionFindFirstArgs} args - Arguments to find a Collection
     * @example
     * // Get one Collection
     * const collection = await prisma.collection.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends CollectionFindFirstArgs>(args?: SelectSubset<T, CollectionFindFirstArgs<ExtArgs>>): Prisma__CollectionClient<$Result.GetResult<Prisma.$CollectionPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first Collection that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CollectionFindFirstOrThrowArgs} args - Arguments to find a Collection
     * @example
     * // Get one Collection
     * const collection = await prisma.collection.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends CollectionFindFirstOrThrowArgs>(args?: SelectSubset<T, CollectionFindFirstOrThrowArgs<ExtArgs>>): Prisma__CollectionClient<$Result.GetResult<Prisma.$CollectionPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more Collections that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CollectionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Collections
     * const collections = await prisma.collection.findMany()
     * 
     * // Get first 10 Collections
     * const collections = await prisma.collection.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const collectionWithIdOnly = await prisma.collection.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends CollectionFindManyArgs>(args?: SelectSubset<T, CollectionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CollectionPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a Collection.
     * @param {CollectionCreateArgs} args - Arguments to create a Collection.
     * @example
     * // Create one Collection
     * const Collection = await prisma.collection.create({
     *   data: {
     *     // ... data to create a Collection
     *   }
     * })
     * 
     */
    create<T extends CollectionCreateArgs>(args: SelectSubset<T, CollectionCreateArgs<ExtArgs>>): Prisma__CollectionClient<$Result.GetResult<Prisma.$CollectionPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many Collections.
     * @param {CollectionCreateManyArgs} args - Arguments to create many Collections.
     * @example
     * // Create many Collections
     * const collection = await prisma.collection.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends CollectionCreateManyArgs>(args?: SelectSubset<T, CollectionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Collections and returns the data saved in the database.
     * @param {CollectionCreateManyAndReturnArgs} args - Arguments to create many Collections.
     * @example
     * // Create many Collections
     * const collection = await prisma.collection.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Collections and only return the `id`
     * const collectionWithIdOnly = await prisma.collection.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends CollectionCreateManyAndReturnArgs>(args?: SelectSubset<T, CollectionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CollectionPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a Collection.
     * @param {CollectionDeleteArgs} args - Arguments to delete one Collection.
     * @example
     * // Delete one Collection
     * const Collection = await prisma.collection.delete({
     *   where: {
     *     // ... filter to delete one Collection
     *   }
     * })
     * 
     */
    delete<T extends CollectionDeleteArgs>(args: SelectSubset<T, CollectionDeleteArgs<ExtArgs>>): Prisma__CollectionClient<$Result.GetResult<Prisma.$CollectionPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one Collection.
     * @param {CollectionUpdateArgs} args - Arguments to update one Collection.
     * @example
     * // Update one Collection
     * const collection = await prisma.collection.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends CollectionUpdateArgs>(args: SelectSubset<T, CollectionUpdateArgs<ExtArgs>>): Prisma__CollectionClient<$Result.GetResult<Prisma.$CollectionPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more Collections.
     * @param {CollectionDeleteManyArgs} args - Arguments to filter Collections to delete.
     * @example
     * // Delete a few Collections
     * const { count } = await prisma.collection.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends CollectionDeleteManyArgs>(args?: SelectSubset<T, CollectionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Collections.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CollectionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Collections
     * const collection = await prisma.collection.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends CollectionUpdateManyArgs>(args: SelectSubset<T, CollectionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Collection.
     * @param {CollectionUpsertArgs} args - Arguments to update or create a Collection.
     * @example
     * // Update or create a Collection
     * const collection = await prisma.collection.upsert({
     *   create: {
     *     // ... data to create a Collection
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Collection we want to update
     *   }
     * })
     */
    upsert<T extends CollectionUpsertArgs>(args: SelectSubset<T, CollectionUpsertArgs<ExtArgs>>): Prisma__CollectionClient<$Result.GetResult<Prisma.$CollectionPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of Collections.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CollectionCountArgs} args - Arguments to filter Collections to count.
     * @example
     * // Count the number of Collections
     * const count = await prisma.collection.count({
     *   where: {
     *     // ... the filter for the Collections we want to count
     *   }
     * })
    **/
    count<T extends CollectionCountArgs>(
      args?: Subset<T, CollectionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], CollectionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Collection.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CollectionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends CollectionAggregateArgs>(args: Subset<T, CollectionAggregateArgs>): Prisma.PrismaPromise<GetCollectionAggregateType<T>>

    /**
     * Group by Collection.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CollectionGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends CollectionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: CollectionGroupByArgs['orderBy'] }
        : { orderBy?: CollectionGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, CollectionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetCollectionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Collection model
   */
  readonly fields: CollectionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Collection.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__CollectionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    drawings<T extends Collection$drawingsArgs<ExtArgs> = {}>(args?: Subset<T, Collection$drawingsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DrawingPayload<ExtArgs>, T, "findMany"> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Collection model
   */ 
  interface CollectionFieldRefs {
    readonly id: FieldRef<"Collection", 'String'>
    readonly name: FieldRef<"Collection", 'String'>
    readonly createdAt: FieldRef<"Collection", 'DateTime'>
    readonly updatedAt: FieldRef<"Collection", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Collection findUnique
   */
  export type CollectionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collection
     */
    select?: CollectionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollectionInclude<ExtArgs> | null
    /**
     * Filter, which Collection to fetch.
     */
    where: CollectionWhereUniqueInput
  }

  /**
   * Collection findUniqueOrThrow
   */
  export type CollectionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collection
     */
    select?: CollectionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollectionInclude<ExtArgs> | null
    /**
     * Filter, which Collection to fetch.
     */
    where: CollectionWhereUniqueInput
  }

  /**
   * Collection findFirst
   */
  export type CollectionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collection
     */
    select?: CollectionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollectionInclude<ExtArgs> | null
    /**
     * Filter, which Collection to fetch.
     */
    where?: CollectionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Collections to fetch.
     */
    orderBy?: CollectionOrderByWithRelationInput | CollectionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Collections.
     */
    cursor?: CollectionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Collections from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Collections.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Collections.
     */
    distinct?: CollectionScalarFieldEnum | CollectionScalarFieldEnum[]
  }

  /**
   * Collection findFirstOrThrow
   */
  export type CollectionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collection
     */
    select?: CollectionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollectionInclude<ExtArgs> | null
    /**
     * Filter, which Collection to fetch.
     */
    where?: CollectionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Collections to fetch.
     */
    orderBy?: CollectionOrderByWithRelationInput | CollectionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Collections.
     */
    cursor?: CollectionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Collections from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Collections.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Collections.
     */
    distinct?: CollectionScalarFieldEnum | CollectionScalarFieldEnum[]
  }

  /**
   * Collection findMany
   */
  export type CollectionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collection
     */
    select?: CollectionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollectionInclude<ExtArgs> | null
    /**
     * Filter, which Collections to fetch.
     */
    where?: CollectionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Collections to fetch.
     */
    orderBy?: CollectionOrderByWithRelationInput | CollectionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Collections.
     */
    cursor?: CollectionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Collections from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Collections.
     */
    skip?: number
    distinct?: CollectionScalarFieldEnum | CollectionScalarFieldEnum[]
  }

  /**
   * Collection create
   */
  export type CollectionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collection
     */
    select?: CollectionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollectionInclude<ExtArgs> | null
    /**
     * The data needed to create a Collection.
     */
    data: XOR<CollectionCreateInput, CollectionUncheckedCreateInput>
  }

  /**
   * Collection createMany
   */
  export type CollectionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Collections.
     */
    data: CollectionCreateManyInput | CollectionCreateManyInput[]
  }

  /**
   * Collection createManyAndReturn
   */
  export type CollectionCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collection
     */
    select?: CollectionSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many Collections.
     */
    data: CollectionCreateManyInput | CollectionCreateManyInput[]
  }

  /**
   * Collection update
   */
  export type CollectionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collection
     */
    select?: CollectionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollectionInclude<ExtArgs> | null
    /**
     * The data needed to update a Collection.
     */
    data: XOR<CollectionUpdateInput, CollectionUncheckedUpdateInput>
    /**
     * Choose, which Collection to update.
     */
    where: CollectionWhereUniqueInput
  }

  /**
   * Collection updateMany
   */
  export type CollectionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Collections.
     */
    data: XOR<CollectionUpdateManyMutationInput, CollectionUncheckedUpdateManyInput>
    /**
     * Filter which Collections to update
     */
    where?: CollectionWhereInput
  }

  /**
   * Collection upsert
   */
  export type CollectionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collection
     */
    select?: CollectionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollectionInclude<ExtArgs> | null
    /**
     * The filter to search for the Collection to update in case it exists.
     */
    where: CollectionWhereUniqueInput
    /**
     * In case the Collection found by the `where` argument doesn't exist, create a new Collection with this data.
     */
    create: XOR<CollectionCreateInput, CollectionUncheckedCreateInput>
    /**
     * In case the Collection was found with the provided `where` argument, update it with this data.
     */
    update: XOR<CollectionUpdateInput, CollectionUncheckedUpdateInput>
  }

  /**
   * Collection delete
   */
  export type CollectionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collection
     */
    select?: CollectionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollectionInclude<ExtArgs> | null
    /**
     * Filter which Collection to delete.
     */
    where: CollectionWhereUniqueInput
  }

  /**
   * Collection deleteMany
   */
  export type CollectionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Collections to delete
     */
    where?: CollectionWhereInput
  }

  /**
   * Collection.drawings
   */
  export type Collection$drawingsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Drawing
     */
    select?: DrawingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DrawingInclude<ExtArgs> | null
    where?: DrawingWhereInput
    orderBy?: DrawingOrderByWithRelationInput | DrawingOrderByWithRelationInput[]
    cursor?: DrawingWhereUniqueInput
    take?: number
    skip?: number
    distinct?: DrawingScalarFieldEnum | DrawingScalarFieldEnum[]
  }

  /**
   * Collection without action
   */
  export type CollectionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collection
     */
    select?: CollectionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollectionInclude<ExtArgs> | null
  }


  /**
   * Model Drawing
   */

  export type AggregateDrawing = {
    _count: DrawingCountAggregateOutputType | null
    _avg: DrawingAvgAggregateOutputType | null
    _sum: DrawingSumAggregateOutputType | null
    _min: DrawingMinAggregateOutputType | null
    _max: DrawingMaxAggregateOutputType | null
  }

  export type DrawingAvgAggregateOutputType = {
    version: number | null
  }

  export type DrawingSumAggregateOutputType = {
    version: number | null
  }

  export type DrawingMinAggregateOutputType = {
    id: string | null
    name: string | null
    elements: string | null
    appState: string | null
    files: string | null
    preview: string | null
    version: number | null
    collectionId: string | null
    createdAt: Date | null
    updatedAt: Date | null
    isPrivate: boolean | null
    encryptedData: string | null
    iv: string | null
  }

  export type DrawingMaxAggregateOutputType = {
    id: string | null
    name: string | null
    elements: string | null
    appState: string | null
    files: string | null
    preview: string | null
    version: number | null
    collectionId: string | null
    createdAt: Date | null
    updatedAt: Date | null
    isPrivate: boolean | null
    encryptedData: string | null
    iv: string | null
  }

  export type DrawingCountAggregateOutputType = {
    id: number
    name: number
    elements: number
    appState: number
    files: number
    preview: number
    version: number
    collectionId: number
    createdAt: number
    updatedAt: number
    isPrivate: number
    encryptedData: number
    iv: number
    _all: number
  }


  export type DrawingAvgAggregateInputType = {
    version?: true
  }

  export type DrawingSumAggregateInputType = {
    version?: true
  }

  export type DrawingMinAggregateInputType = {
    id?: true
    name?: true
    elements?: true
    appState?: true
    files?: true
    preview?: true
    version?: true
    collectionId?: true
    createdAt?: true
    updatedAt?: true
    isPrivate?: true
    encryptedData?: true
    iv?: true
  }

  export type DrawingMaxAggregateInputType = {
    id?: true
    name?: true
    elements?: true
    appState?: true
    files?: true
    preview?: true
    version?: true
    collectionId?: true
    createdAt?: true
    updatedAt?: true
    isPrivate?: true
    encryptedData?: true
    iv?: true
  }

  export type DrawingCountAggregateInputType = {
    id?: true
    name?: true
    elements?: true
    appState?: true
    files?: true
    preview?: true
    version?: true
    collectionId?: true
    createdAt?: true
    updatedAt?: true
    isPrivate?: true
    encryptedData?: true
    iv?: true
    _all?: true
  }

  export type DrawingAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Drawing to aggregate.
     */
    where?: DrawingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Drawings to fetch.
     */
    orderBy?: DrawingOrderByWithRelationInput | DrawingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: DrawingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Drawings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Drawings.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Drawings
    **/
    _count?: true | DrawingCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: DrawingAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: DrawingSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: DrawingMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: DrawingMaxAggregateInputType
  }

  export type GetDrawingAggregateType<T extends DrawingAggregateArgs> = {
        [P in keyof T & keyof AggregateDrawing]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateDrawing[P]>
      : GetScalarType<T[P], AggregateDrawing[P]>
  }




  export type DrawingGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: DrawingWhereInput
    orderBy?: DrawingOrderByWithAggregationInput | DrawingOrderByWithAggregationInput[]
    by: DrawingScalarFieldEnum[] | DrawingScalarFieldEnum
    having?: DrawingScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: DrawingCountAggregateInputType | true
    _avg?: DrawingAvgAggregateInputType
    _sum?: DrawingSumAggregateInputType
    _min?: DrawingMinAggregateInputType
    _max?: DrawingMaxAggregateInputType
  }

  export type DrawingGroupByOutputType = {
    id: string
    name: string
    elements: string
    appState: string
    files: string
    preview: string | null
    version: number
    collectionId: string | null
    createdAt: Date
    updatedAt: Date
    isPrivate: boolean
    encryptedData: string | null
    iv: string | null
    _count: DrawingCountAggregateOutputType | null
    _avg: DrawingAvgAggregateOutputType | null
    _sum: DrawingSumAggregateOutputType | null
    _min: DrawingMinAggregateOutputType | null
    _max: DrawingMaxAggregateOutputType | null
  }

  type GetDrawingGroupByPayload<T extends DrawingGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<DrawingGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof DrawingGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], DrawingGroupByOutputType[P]>
            : GetScalarType<T[P], DrawingGroupByOutputType[P]>
        }
      >
    >


  export type DrawingSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    elements?: boolean
    appState?: boolean
    files?: boolean
    preview?: boolean
    version?: boolean
    collectionId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    isPrivate?: boolean
    encryptedData?: boolean
    iv?: boolean
    collection?: boolean | Drawing$collectionArgs<ExtArgs>
  }, ExtArgs["result"]["drawing"]>

  export type DrawingSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    elements?: boolean
    appState?: boolean
    files?: boolean
    preview?: boolean
    version?: boolean
    collectionId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    isPrivate?: boolean
    encryptedData?: boolean
    iv?: boolean
    collection?: boolean | Drawing$collectionArgs<ExtArgs>
  }, ExtArgs["result"]["drawing"]>

  export type DrawingSelectScalar = {
    id?: boolean
    name?: boolean
    elements?: boolean
    appState?: boolean
    files?: boolean
    preview?: boolean
    version?: boolean
    collectionId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    isPrivate?: boolean
    encryptedData?: boolean
    iv?: boolean
  }

  export type DrawingInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    collection?: boolean | Drawing$collectionArgs<ExtArgs>
  }
  export type DrawingIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    collection?: boolean | Drawing$collectionArgs<ExtArgs>
  }

  export type $DrawingPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Drawing"
    objects: {
      collection: Prisma.$CollectionPayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      name: string
      elements: string
      appState: string
      files: string
      preview: string | null
      version: number
      collectionId: string | null
      createdAt: Date
      updatedAt: Date
      isPrivate: boolean
      encryptedData: string | null
      iv: string | null
    }, ExtArgs["result"]["drawing"]>
    composites: {}
  }

  type DrawingGetPayload<S extends boolean | null | undefined | DrawingDefaultArgs> = $Result.GetResult<Prisma.$DrawingPayload, S>

  type DrawingCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<DrawingFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: DrawingCountAggregateInputType | true
    }

  export interface DrawingDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Drawing'], meta: { name: 'Drawing' } }
    /**
     * Find zero or one Drawing that matches the filter.
     * @param {DrawingFindUniqueArgs} args - Arguments to find a Drawing
     * @example
     * // Get one Drawing
     * const drawing = await prisma.drawing.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends DrawingFindUniqueArgs>(args: SelectSubset<T, DrawingFindUniqueArgs<ExtArgs>>): Prisma__DrawingClient<$Result.GetResult<Prisma.$DrawingPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one Drawing that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {DrawingFindUniqueOrThrowArgs} args - Arguments to find a Drawing
     * @example
     * // Get one Drawing
     * const drawing = await prisma.drawing.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends DrawingFindUniqueOrThrowArgs>(args: SelectSubset<T, DrawingFindUniqueOrThrowArgs<ExtArgs>>): Prisma__DrawingClient<$Result.GetResult<Prisma.$DrawingPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first Drawing that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DrawingFindFirstArgs} args - Arguments to find a Drawing
     * @example
     * // Get one Drawing
     * const drawing = await prisma.drawing.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends DrawingFindFirstArgs>(args?: SelectSubset<T, DrawingFindFirstArgs<ExtArgs>>): Prisma__DrawingClient<$Result.GetResult<Prisma.$DrawingPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first Drawing that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DrawingFindFirstOrThrowArgs} args - Arguments to find a Drawing
     * @example
     * // Get one Drawing
     * const drawing = await prisma.drawing.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends DrawingFindFirstOrThrowArgs>(args?: SelectSubset<T, DrawingFindFirstOrThrowArgs<ExtArgs>>): Prisma__DrawingClient<$Result.GetResult<Prisma.$DrawingPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more Drawings that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DrawingFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Drawings
     * const drawings = await prisma.drawing.findMany()
     * 
     * // Get first 10 Drawings
     * const drawings = await prisma.drawing.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const drawingWithIdOnly = await prisma.drawing.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends DrawingFindManyArgs>(args?: SelectSubset<T, DrawingFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DrawingPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a Drawing.
     * @param {DrawingCreateArgs} args - Arguments to create a Drawing.
     * @example
     * // Create one Drawing
     * const Drawing = await prisma.drawing.create({
     *   data: {
     *     // ... data to create a Drawing
     *   }
     * })
     * 
     */
    create<T extends DrawingCreateArgs>(args: SelectSubset<T, DrawingCreateArgs<ExtArgs>>): Prisma__DrawingClient<$Result.GetResult<Prisma.$DrawingPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many Drawings.
     * @param {DrawingCreateManyArgs} args - Arguments to create many Drawings.
     * @example
     * // Create many Drawings
     * const drawing = await prisma.drawing.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends DrawingCreateManyArgs>(args?: SelectSubset<T, DrawingCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Drawings and returns the data saved in the database.
     * @param {DrawingCreateManyAndReturnArgs} args - Arguments to create many Drawings.
     * @example
     * // Create many Drawings
     * const drawing = await prisma.drawing.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Drawings and only return the `id`
     * const drawingWithIdOnly = await prisma.drawing.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends DrawingCreateManyAndReturnArgs>(args?: SelectSubset<T, DrawingCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DrawingPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a Drawing.
     * @param {DrawingDeleteArgs} args - Arguments to delete one Drawing.
     * @example
     * // Delete one Drawing
     * const Drawing = await prisma.drawing.delete({
     *   where: {
     *     // ... filter to delete one Drawing
     *   }
     * })
     * 
     */
    delete<T extends DrawingDeleteArgs>(args: SelectSubset<T, DrawingDeleteArgs<ExtArgs>>): Prisma__DrawingClient<$Result.GetResult<Prisma.$DrawingPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one Drawing.
     * @param {DrawingUpdateArgs} args - Arguments to update one Drawing.
     * @example
     * // Update one Drawing
     * const drawing = await prisma.drawing.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends DrawingUpdateArgs>(args: SelectSubset<T, DrawingUpdateArgs<ExtArgs>>): Prisma__DrawingClient<$Result.GetResult<Prisma.$DrawingPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more Drawings.
     * @param {DrawingDeleteManyArgs} args - Arguments to filter Drawings to delete.
     * @example
     * // Delete a few Drawings
     * const { count } = await prisma.drawing.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends DrawingDeleteManyArgs>(args?: SelectSubset<T, DrawingDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Drawings.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DrawingUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Drawings
     * const drawing = await prisma.drawing.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends DrawingUpdateManyArgs>(args: SelectSubset<T, DrawingUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Drawing.
     * @param {DrawingUpsertArgs} args - Arguments to update or create a Drawing.
     * @example
     * // Update or create a Drawing
     * const drawing = await prisma.drawing.upsert({
     *   create: {
     *     // ... data to create a Drawing
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Drawing we want to update
     *   }
     * })
     */
    upsert<T extends DrawingUpsertArgs>(args: SelectSubset<T, DrawingUpsertArgs<ExtArgs>>): Prisma__DrawingClient<$Result.GetResult<Prisma.$DrawingPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of Drawings.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DrawingCountArgs} args - Arguments to filter Drawings to count.
     * @example
     * // Count the number of Drawings
     * const count = await prisma.drawing.count({
     *   where: {
     *     // ... the filter for the Drawings we want to count
     *   }
     * })
    **/
    count<T extends DrawingCountArgs>(
      args?: Subset<T, DrawingCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], DrawingCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Drawing.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DrawingAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends DrawingAggregateArgs>(args: Subset<T, DrawingAggregateArgs>): Prisma.PrismaPromise<GetDrawingAggregateType<T>>

    /**
     * Group by Drawing.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DrawingGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends DrawingGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: DrawingGroupByArgs['orderBy'] }
        : { orderBy?: DrawingGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, DrawingGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetDrawingGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Drawing model
   */
  readonly fields: DrawingFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Drawing.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__DrawingClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    collection<T extends Drawing$collectionArgs<ExtArgs> = {}>(args?: Subset<T, Drawing$collectionArgs<ExtArgs>>): Prisma__CollectionClient<$Result.GetResult<Prisma.$CollectionPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Drawing model
   */ 
  interface DrawingFieldRefs {
    readonly id: FieldRef<"Drawing", 'String'>
    readonly name: FieldRef<"Drawing", 'String'>
    readonly elements: FieldRef<"Drawing", 'String'>
    readonly appState: FieldRef<"Drawing", 'String'>
    readonly files: FieldRef<"Drawing", 'String'>
    readonly preview: FieldRef<"Drawing", 'String'>
    readonly version: FieldRef<"Drawing", 'Int'>
    readonly collectionId: FieldRef<"Drawing", 'String'>
    readonly createdAt: FieldRef<"Drawing", 'DateTime'>
    readonly updatedAt: FieldRef<"Drawing", 'DateTime'>
    readonly isPrivate: FieldRef<"Drawing", 'Boolean'>
    readonly encryptedData: FieldRef<"Drawing", 'String'>
    readonly iv: FieldRef<"Drawing", 'String'>
  }
    

  // Custom InputTypes
  /**
   * Drawing findUnique
   */
  export type DrawingFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Drawing
     */
    select?: DrawingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DrawingInclude<ExtArgs> | null
    /**
     * Filter, which Drawing to fetch.
     */
    where: DrawingWhereUniqueInput
  }

  /**
   * Drawing findUniqueOrThrow
   */
  export type DrawingFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Drawing
     */
    select?: DrawingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DrawingInclude<ExtArgs> | null
    /**
     * Filter, which Drawing to fetch.
     */
    where: DrawingWhereUniqueInput
  }

  /**
   * Drawing findFirst
   */
  export type DrawingFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Drawing
     */
    select?: DrawingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DrawingInclude<ExtArgs> | null
    /**
     * Filter, which Drawing to fetch.
     */
    where?: DrawingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Drawings to fetch.
     */
    orderBy?: DrawingOrderByWithRelationInput | DrawingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Drawings.
     */
    cursor?: DrawingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Drawings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Drawings.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Drawings.
     */
    distinct?: DrawingScalarFieldEnum | DrawingScalarFieldEnum[]
  }

  /**
   * Drawing findFirstOrThrow
   */
  export type DrawingFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Drawing
     */
    select?: DrawingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DrawingInclude<ExtArgs> | null
    /**
     * Filter, which Drawing to fetch.
     */
    where?: DrawingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Drawings to fetch.
     */
    orderBy?: DrawingOrderByWithRelationInput | DrawingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Drawings.
     */
    cursor?: DrawingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Drawings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Drawings.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Drawings.
     */
    distinct?: DrawingScalarFieldEnum | DrawingScalarFieldEnum[]
  }

  /**
   * Drawing findMany
   */
  export type DrawingFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Drawing
     */
    select?: DrawingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DrawingInclude<ExtArgs> | null
    /**
     * Filter, which Drawings to fetch.
     */
    where?: DrawingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Drawings to fetch.
     */
    orderBy?: DrawingOrderByWithRelationInput | DrawingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Drawings.
     */
    cursor?: DrawingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Drawings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Drawings.
     */
    skip?: number
    distinct?: DrawingScalarFieldEnum | DrawingScalarFieldEnum[]
  }

  /**
   * Drawing create
   */
  export type DrawingCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Drawing
     */
    select?: DrawingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DrawingInclude<ExtArgs> | null
    /**
     * The data needed to create a Drawing.
     */
    data: XOR<DrawingCreateInput, DrawingUncheckedCreateInput>
  }

  /**
   * Drawing createMany
   */
  export type DrawingCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Drawings.
     */
    data: DrawingCreateManyInput | DrawingCreateManyInput[]
  }

  /**
   * Drawing createManyAndReturn
   */
  export type DrawingCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Drawing
     */
    select?: DrawingSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many Drawings.
     */
    data: DrawingCreateManyInput | DrawingCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DrawingIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Drawing update
   */
  export type DrawingUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Drawing
     */
    select?: DrawingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DrawingInclude<ExtArgs> | null
    /**
     * The data needed to update a Drawing.
     */
    data: XOR<DrawingUpdateInput, DrawingUncheckedUpdateInput>
    /**
     * Choose, which Drawing to update.
     */
    where: DrawingWhereUniqueInput
  }

  /**
   * Drawing updateMany
   */
  export type DrawingUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Drawings.
     */
    data: XOR<DrawingUpdateManyMutationInput, DrawingUncheckedUpdateManyInput>
    /**
     * Filter which Drawings to update
     */
    where?: DrawingWhereInput
  }

  /**
   * Drawing upsert
   */
  export type DrawingUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Drawing
     */
    select?: DrawingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DrawingInclude<ExtArgs> | null
    /**
     * The filter to search for the Drawing to update in case it exists.
     */
    where: DrawingWhereUniqueInput
    /**
     * In case the Drawing found by the `where` argument doesn't exist, create a new Drawing with this data.
     */
    create: XOR<DrawingCreateInput, DrawingUncheckedCreateInput>
    /**
     * In case the Drawing was found with the provided `where` argument, update it with this data.
     */
    update: XOR<DrawingUpdateInput, DrawingUncheckedUpdateInput>
  }

  /**
   * Drawing delete
   */
  export type DrawingDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Drawing
     */
    select?: DrawingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DrawingInclude<ExtArgs> | null
    /**
     * Filter which Drawing to delete.
     */
    where: DrawingWhereUniqueInput
  }

  /**
   * Drawing deleteMany
   */
  export type DrawingDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Drawings to delete
     */
    where?: DrawingWhereInput
  }

  /**
   * Drawing.collection
   */
  export type Drawing$collectionArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collection
     */
    select?: CollectionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollectionInclude<ExtArgs> | null
    where?: CollectionWhereInput
  }

  /**
   * Drawing without action
   */
  export type DrawingDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Drawing
     */
    select?: DrawingSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DrawingInclude<ExtArgs> | null
  }


  /**
   * Model PrivateVault
   */

  export type AggregatePrivateVault = {
    _count: PrivateVaultCountAggregateOutputType | null
    _min: PrivateVaultMinAggregateOutputType | null
    _max: PrivateVaultMaxAggregateOutputType | null
  }

  export type PrivateVaultMinAggregateOutputType = {
    id: string | null
    passwordHash: string | null
    salt: string | null
    hint: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type PrivateVaultMaxAggregateOutputType = {
    id: string | null
    passwordHash: string | null
    salt: string | null
    hint: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type PrivateVaultCountAggregateOutputType = {
    id: number
    passwordHash: number
    salt: number
    hint: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type PrivateVaultMinAggregateInputType = {
    id?: true
    passwordHash?: true
    salt?: true
    hint?: true
    createdAt?: true
    updatedAt?: true
  }

  export type PrivateVaultMaxAggregateInputType = {
    id?: true
    passwordHash?: true
    salt?: true
    hint?: true
    createdAt?: true
    updatedAt?: true
  }

  export type PrivateVaultCountAggregateInputType = {
    id?: true
    passwordHash?: true
    salt?: true
    hint?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type PrivateVaultAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which PrivateVault to aggregate.
     */
    where?: PrivateVaultWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PrivateVaults to fetch.
     */
    orderBy?: PrivateVaultOrderByWithRelationInput | PrivateVaultOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: PrivateVaultWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PrivateVaults from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PrivateVaults.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned PrivateVaults
    **/
    _count?: true | PrivateVaultCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: PrivateVaultMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: PrivateVaultMaxAggregateInputType
  }

  export type GetPrivateVaultAggregateType<T extends PrivateVaultAggregateArgs> = {
        [P in keyof T & keyof AggregatePrivateVault]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregatePrivateVault[P]>
      : GetScalarType<T[P], AggregatePrivateVault[P]>
  }




  export type PrivateVaultGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PrivateVaultWhereInput
    orderBy?: PrivateVaultOrderByWithAggregationInput | PrivateVaultOrderByWithAggregationInput[]
    by: PrivateVaultScalarFieldEnum[] | PrivateVaultScalarFieldEnum
    having?: PrivateVaultScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: PrivateVaultCountAggregateInputType | true
    _min?: PrivateVaultMinAggregateInputType
    _max?: PrivateVaultMaxAggregateInputType
  }

  export type PrivateVaultGroupByOutputType = {
    id: string
    passwordHash: string
    salt: string
    hint: string | null
    createdAt: Date
    updatedAt: Date
    _count: PrivateVaultCountAggregateOutputType | null
    _min: PrivateVaultMinAggregateOutputType | null
    _max: PrivateVaultMaxAggregateOutputType | null
  }

  type GetPrivateVaultGroupByPayload<T extends PrivateVaultGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<PrivateVaultGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof PrivateVaultGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], PrivateVaultGroupByOutputType[P]>
            : GetScalarType<T[P], PrivateVaultGroupByOutputType[P]>
        }
      >
    >


  export type PrivateVaultSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    passwordHash?: boolean
    salt?: boolean
    hint?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["privateVault"]>

  export type PrivateVaultSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    passwordHash?: boolean
    salt?: boolean
    hint?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["privateVault"]>

  export type PrivateVaultSelectScalar = {
    id?: boolean
    passwordHash?: boolean
    salt?: boolean
    hint?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }


  export type $PrivateVaultPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "PrivateVault"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      passwordHash: string
      salt: string
      hint: string | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["privateVault"]>
    composites: {}
  }

  type PrivateVaultGetPayload<S extends boolean | null | undefined | PrivateVaultDefaultArgs> = $Result.GetResult<Prisma.$PrivateVaultPayload, S>

  type PrivateVaultCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<PrivateVaultFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: PrivateVaultCountAggregateInputType | true
    }

  export interface PrivateVaultDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['PrivateVault'], meta: { name: 'PrivateVault' } }
    /**
     * Find zero or one PrivateVault that matches the filter.
     * @param {PrivateVaultFindUniqueArgs} args - Arguments to find a PrivateVault
     * @example
     * // Get one PrivateVault
     * const privateVault = await prisma.privateVault.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends PrivateVaultFindUniqueArgs>(args: SelectSubset<T, PrivateVaultFindUniqueArgs<ExtArgs>>): Prisma__PrivateVaultClient<$Result.GetResult<Prisma.$PrivateVaultPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one PrivateVault that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {PrivateVaultFindUniqueOrThrowArgs} args - Arguments to find a PrivateVault
     * @example
     * // Get one PrivateVault
     * const privateVault = await prisma.privateVault.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends PrivateVaultFindUniqueOrThrowArgs>(args: SelectSubset<T, PrivateVaultFindUniqueOrThrowArgs<ExtArgs>>): Prisma__PrivateVaultClient<$Result.GetResult<Prisma.$PrivateVaultPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first PrivateVault that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivateVaultFindFirstArgs} args - Arguments to find a PrivateVault
     * @example
     * // Get one PrivateVault
     * const privateVault = await prisma.privateVault.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends PrivateVaultFindFirstArgs>(args?: SelectSubset<T, PrivateVaultFindFirstArgs<ExtArgs>>): Prisma__PrivateVaultClient<$Result.GetResult<Prisma.$PrivateVaultPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first PrivateVault that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivateVaultFindFirstOrThrowArgs} args - Arguments to find a PrivateVault
     * @example
     * // Get one PrivateVault
     * const privateVault = await prisma.privateVault.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends PrivateVaultFindFirstOrThrowArgs>(args?: SelectSubset<T, PrivateVaultFindFirstOrThrowArgs<ExtArgs>>): Prisma__PrivateVaultClient<$Result.GetResult<Prisma.$PrivateVaultPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more PrivateVaults that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivateVaultFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all PrivateVaults
     * const privateVaults = await prisma.privateVault.findMany()
     * 
     * // Get first 10 PrivateVaults
     * const privateVaults = await prisma.privateVault.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const privateVaultWithIdOnly = await prisma.privateVault.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends PrivateVaultFindManyArgs>(args?: SelectSubset<T, PrivateVaultFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PrivateVaultPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a PrivateVault.
     * @param {PrivateVaultCreateArgs} args - Arguments to create a PrivateVault.
     * @example
     * // Create one PrivateVault
     * const PrivateVault = await prisma.privateVault.create({
     *   data: {
     *     // ... data to create a PrivateVault
     *   }
     * })
     * 
     */
    create<T extends PrivateVaultCreateArgs>(args: SelectSubset<T, PrivateVaultCreateArgs<ExtArgs>>): Prisma__PrivateVaultClient<$Result.GetResult<Prisma.$PrivateVaultPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many PrivateVaults.
     * @param {PrivateVaultCreateManyArgs} args - Arguments to create many PrivateVaults.
     * @example
     * // Create many PrivateVaults
     * const privateVault = await prisma.privateVault.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends PrivateVaultCreateManyArgs>(args?: SelectSubset<T, PrivateVaultCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many PrivateVaults and returns the data saved in the database.
     * @param {PrivateVaultCreateManyAndReturnArgs} args - Arguments to create many PrivateVaults.
     * @example
     * // Create many PrivateVaults
     * const privateVault = await prisma.privateVault.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many PrivateVaults and only return the `id`
     * const privateVaultWithIdOnly = await prisma.privateVault.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends PrivateVaultCreateManyAndReturnArgs>(args?: SelectSubset<T, PrivateVaultCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PrivateVaultPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a PrivateVault.
     * @param {PrivateVaultDeleteArgs} args - Arguments to delete one PrivateVault.
     * @example
     * // Delete one PrivateVault
     * const PrivateVault = await prisma.privateVault.delete({
     *   where: {
     *     // ... filter to delete one PrivateVault
     *   }
     * })
     * 
     */
    delete<T extends PrivateVaultDeleteArgs>(args: SelectSubset<T, PrivateVaultDeleteArgs<ExtArgs>>): Prisma__PrivateVaultClient<$Result.GetResult<Prisma.$PrivateVaultPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one PrivateVault.
     * @param {PrivateVaultUpdateArgs} args - Arguments to update one PrivateVault.
     * @example
     * // Update one PrivateVault
     * const privateVault = await prisma.privateVault.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends PrivateVaultUpdateArgs>(args: SelectSubset<T, PrivateVaultUpdateArgs<ExtArgs>>): Prisma__PrivateVaultClient<$Result.GetResult<Prisma.$PrivateVaultPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more PrivateVaults.
     * @param {PrivateVaultDeleteManyArgs} args - Arguments to filter PrivateVaults to delete.
     * @example
     * // Delete a few PrivateVaults
     * const { count } = await prisma.privateVault.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends PrivateVaultDeleteManyArgs>(args?: SelectSubset<T, PrivateVaultDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more PrivateVaults.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivateVaultUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many PrivateVaults
     * const privateVault = await prisma.privateVault.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends PrivateVaultUpdateManyArgs>(args: SelectSubset<T, PrivateVaultUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one PrivateVault.
     * @param {PrivateVaultUpsertArgs} args - Arguments to update or create a PrivateVault.
     * @example
     * // Update or create a PrivateVault
     * const privateVault = await prisma.privateVault.upsert({
     *   create: {
     *     // ... data to create a PrivateVault
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the PrivateVault we want to update
     *   }
     * })
     */
    upsert<T extends PrivateVaultUpsertArgs>(args: SelectSubset<T, PrivateVaultUpsertArgs<ExtArgs>>): Prisma__PrivateVaultClient<$Result.GetResult<Prisma.$PrivateVaultPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of PrivateVaults.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivateVaultCountArgs} args - Arguments to filter PrivateVaults to count.
     * @example
     * // Count the number of PrivateVaults
     * const count = await prisma.privateVault.count({
     *   where: {
     *     // ... the filter for the PrivateVaults we want to count
     *   }
     * })
    **/
    count<T extends PrivateVaultCountArgs>(
      args?: Subset<T, PrivateVaultCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], PrivateVaultCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a PrivateVault.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivateVaultAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends PrivateVaultAggregateArgs>(args: Subset<T, PrivateVaultAggregateArgs>): Prisma.PrismaPromise<GetPrivateVaultAggregateType<T>>

    /**
     * Group by PrivateVault.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivateVaultGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends PrivateVaultGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: PrivateVaultGroupByArgs['orderBy'] }
        : { orderBy?: PrivateVaultGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, PrivateVaultGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetPrivateVaultGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the PrivateVault model
   */
  readonly fields: PrivateVaultFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for PrivateVault.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__PrivateVaultClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the PrivateVault model
   */ 
  interface PrivateVaultFieldRefs {
    readonly id: FieldRef<"PrivateVault", 'String'>
    readonly passwordHash: FieldRef<"PrivateVault", 'String'>
    readonly salt: FieldRef<"PrivateVault", 'String'>
    readonly hint: FieldRef<"PrivateVault", 'String'>
    readonly createdAt: FieldRef<"PrivateVault", 'DateTime'>
    readonly updatedAt: FieldRef<"PrivateVault", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * PrivateVault findUnique
   */
  export type PrivateVaultFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivateVault
     */
    select?: PrivateVaultSelect<ExtArgs> | null
    /**
     * Filter, which PrivateVault to fetch.
     */
    where: PrivateVaultWhereUniqueInput
  }

  /**
   * PrivateVault findUniqueOrThrow
   */
  export type PrivateVaultFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivateVault
     */
    select?: PrivateVaultSelect<ExtArgs> | null
    /**
     * Filter, which PrivateVault to fetch.
     */
    where: PrivateVaultWhereUniqueInput
  }

  /**
   * PrivateVault findFirst
   */
  export type PrivateVaultFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivateVault
     */
    select?: PrivateVaultSelect<ExtArgs> | null
    /**
     * Filter, which PrivateVault to fetch.
     */
    where?: PrivateVaultWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PrivateVaults to fetch.
     */
    orderBy?: PrivateVaultOrderByWithRelationInput | PrivateVaultOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for PrivateVaults.
     */
    cursor?: PrivateVaultWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PrivateVaults from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PrivateVaults.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of PrivateVaults.
     */
    distinct?: PrivateVaultScalarFieldEnum | PrivateVaultScalarFieldEnum[]
  }

  /**
   * PrivateVault findFirstOrThrow
   */
  export type PrivateVaultFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivateVault
     */
    select?: PrivateVaultSelect<ExtArgs> | null
    /**
     * Filter, which PrivateVault to fetch.
     */
    where?: PrivateVaultWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PrivateVaults to fetch.
     */
    orderBy?: PrivateVaultOrderByWithRelationInput | PrivateVaultOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for PrivateVaults.
     */
    cursor?: PrivateVaultWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PrivateVaults from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PrivateVaults.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of PrivateVaults.
     */
    distinct?: PrivateVaultScalarFieldEnum | PrivateVaultScalarFieldEnum[]
  }

  /**
   * PrivateVault findMany
   */
  export type PrivateVaultFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivateVault
     */
    select?: PrivateVaultSelect<ExtArgs> | null
    /**
     * Filter, which PrivateVaults to fetch.
     */
    where?: PrivateVaultWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PrivateVaults to fetch.
     */
    orderBy?: PrivateVaultOrderByWithRelationInput | PrivateVaultOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing PrivateVaults.
     */
    cursor?: PrivateVaultWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PrivateVaults from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PrivateVaults.
     */
    skip?: number
    distinct?: PrivateVaultScalarFieldEnum | PrivateVaultScalarFieldEnum[]
  }

  /**
   * PrivateVault create
   */
  export type PrivateVaultCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivateVault
     */
    select?: PrivateVaultSelect<ExtArgs> | null
    /**
     * The data needed to create a PrivateVault.
     */
    data: XOR<PrivateVaultCreateInput, PrivateVaultUncheckedCreateInput>
  }

  /**
   * PrivateVault createMany
   */
  export type PrivateVaultCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many PrivateVaults.
     */
    data: PrivateVaultCreateManyInput | PrivateVaultCreateManyInput[]
  }

  /**
   * PrivateVault createManyAndReturn
   */
  export type PrivateVaultCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivateVault
     */
    select?: PrivateVaultSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many PrivateVaults.
     */
    data: PrivateVaultCreateManyInput | PrivateVaultCreateManyInput[]
  }

  /**
   * PrivateVault update
   */
  export type PrivateVaultUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivateVault
     */
    select?: PrivateVaultSelect<ExtArgs> | null
    /**
     * The data needed to update a PrivateVault.
     */
    data: XOR<PrivateVaultUpdateInput, PrivateVaultUncheckedUpdateInput>
    /**
     * Choose, which PrivateVault to update.
     */
    where: PrivateVaultWhereUniqueInput
  }

  /**
   * PrivateVault updateMany
   */
  export type PrivateVaultUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update PrivateVaults.
     */
    data: XOR<PrivateVaultUpdateManyMutationInput, PrivateVaultUncheckedUpdateManyInput>
    /**
     * Filter which PrivateVaults to update
     */
    where?: PrivateVaultWhereInput
  }

  /**
   * PrivateVault upsert
   */
  export type PrivateVaultUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivateVault
     */
    select?: PrivateVaultSelect<ExtArgs> | null
    /**
     * The filter to search for the PrivateVault to update in case it exists.
     */
    where: PrivateVaultWhereUniqueInput
    /**
     * In case the PrivateVault found by the `where` argument doesn't exist, create a new PrivateVault with this data.
     */
    create: XOR<PrivateVaultCreateInput, PrivateVaultUncheckedCreateInput>
    /**
     * In case the PrivateVault was found with the provided `where` argument, update it with this data.
     */
    update: XOR<PrivateVaultUpdateInput, PrivateVaultUncheckedUpdateInput>
  }

  /**
   * PrivateVault delete
   */
  export type PrivateVaultDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivateVault
     */
    select?: PrivateVaultSelect<ExtArgs> | null
    /**
     * Filter which PrivateVault to delete.
     */
    where: PrivateVaultWhereUniqueInput
  }

  /**
   * PrivateVault deleteMany
   */
  export type PrivateVaultDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which PrivateVaults to delete
     */
    where?: PrivateVaultWhereInput
  }

  /**
   * PrivateVault without action
   */
  export type PrivateVaultDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivateVault
     */
    select?: PrivateVaultSelect<ExtArgs> | null
  }


  /**
   * Model Library
   */

  export type AggregateLibrary = {
    _count: LibraryCountAggregateOutputType | null
    _min: LibraryMinAggregateOutputType | null
    _max: LibraryMaxAggregateOutputType | null
  }

  export type LibraryMinAggregateOutputType = {
    id: string | null
    items: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type LibraryMaxAggregateOutputType = {
    id: string | null
    items: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type LibraryCountAggregateOutputType = {
    id: number
    items: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type LibraryMinAggregateInputType = {
    id?: true
    items?: true
    createdAt?: true
    updatedAt?: true
  }

  export type LibraryMaxAggregateInputType = {
    id?: true
    items?: true
    createdAt?: true
    updatedAt?: true
  }

  export type LibraryCountAggregateInputType = {
    id?: true
    items?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type LibraryAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Library to aggregate.
     */
    where?: LibraryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Libraries to fetch.
     */
    orderBy?: LibraryOrderByWithRelationInput | LibraryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: LibraryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Libraries from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Libraries.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Libraries
    **/
    _count?: true | LibraryCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: LibraryMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: LibraryMaxAggregateInputType
  }

  export type GetLibraryAggregateType<T extends LibraryAggregateArgs> = {
        [P in keyof T & keyof AggregateLibrary]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateLibrary[P]>
      : GetScalarType<T[P], AggregateLibrary[P]>
  }




  export type LibraryGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: LibraryWhereInput
    orderBy?: LibraryOrderByWithAggregationInput | LibraryOrderByWithAggregationInput[]
    by: LibraryScalarFieldEnum[] | LibraryScalarFieldEnum
    having?: LibraryScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: LibraryCountAggregateInputType | true
    _min?: LibraryMinAggregateInputType
    _max?: LibraryMaxAggregateInputType
  }

  export type LibraryGroupByOutputType = {
    id: string
    items: string
    createdAt: Date
    updatedAt: Date
    _count: LibraryCountAggregateOutputType | null
    _min: LibraryMinAggregateOutputType | null
    _max: LibraryMaxAggregateOutputType | null
  }

  type GetLibraryGroupByPayload<T extends LibraryGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<LibraryGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof LibraryGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], LibraryGroupByOutputType[P]>
            : GetScalarType<T[P], LibraryGroupByOutputType[P]>
        }
      >
    >


  export type LibrarySelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    items?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["library"]>

  export type LibrarySelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    items?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["library"]>

  export type LibrarySelectScalar = {
    id?: boolean
    items?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }


  export type $LibraryPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Library"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      items: string
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["library"]>
    composites: {}
  }

  type LibraryGetPayload<S extends boolean | null | undefined | LibraryDefaultArgs> = $Result.GetResult<Prisma.$LibraryPayload, S>

  type LibraryCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<LibraryFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: LibraryCountAggregateInputType | true
    }

  export interface LibraryDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Library'], meta: { name: 'Library' } }
    /**
     * Find zero or one Library that matches the filter.
     * @param {LibraryFindUniqueArgs} args - Arguments to find a Library
     * @example
     * // Get one Library
     * const library = await prisma.library.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends LibraryFindUniqueArgs>(args: SelectSubset<T, LibraryFindUniqueArgs<ExtArgs>>): Prisma__LibraryClient<$Result.GetResult<Prisma.$LibraryPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one Library that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {LibraryFindUniqueOrThrowArgs} args - Arguments to find a Library
     * @example
     * // Get one Library
     * const library = await prisma.library.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends LibraryFindUniqueOrThrowArgs>(args: SelectSubset<T, LibraryFindUniqueOrThrowArgs<ExtArgs>>): Prisma__LibraryClient<$Result.GetResult<Prisma.$LibraryPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first Library that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LibraryFindFirstArgs} args - Arguments to find a Library
     * @example
     * // Get one Library
     * const library = await prisma.library.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends LibraryFindFirstArgs>(args?: SelectSubset<T, LibraryFindFirstArgs<ExtArgs>>): Prisma__LibraryClient<$Result.GetResult<Prisma.$LibraryPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first Library that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LibraryFindFirstOrThrowArgs} args - Arguments to find a Library
     * @example
     * // Get one Library
     * const library = await prisma.library.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends LibraryFindFirstOrThrowArgs>(args?: SelectSubset<T, LibraryFindFirstOrThrowArgs<ExtArgs>>): Prisma__LibraryClient<$Result.GetResult<Prisma.$LibraryPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more Libraries that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LibraryFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Libraries
     * const libraries = await prisma.library.findMany()
     * 
     * // Get first 10 Libraries
     * const libraries = await prisma.library.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const libraryWithIdOnly = await prisma.library.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends LibraryFindManyArgs>(args?: SelectSubset<T, LibraryFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$LibraryPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a Library.
     * @param {LibraryCreateArgs} args - Arguments to create a Library.
     * @example
     * // Create one Library
     * const Library = await prisma.library.create({
     *   data: {
     *     // ... data to create a Library
     *   }
     * })
     * 
     */
    create<T extends LibraryCreateArgs>(args: SelectSubset<T, LibraryCreateArgs<ExtArgs>>): Prisma__LibraryClient<$Result.GetResult<Prisma.$LibraryPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many Libraries.
     * @param {LibraryCreateManyArgs} args - Arguments to create many Libraries.
     * @example
     * // Create many Libraries
     * const library = await prisma.library.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends LibraryCreateManyArgs>(args?: SelectSubset<T, LibraryCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Libraries and returns the data saved in the database.
     * @param {LibraryCreateManyAndReturnArgs} args - Arguments to create many Libraries.
     * @example
     * // Create many Libraries
     * const library = await prisma.library.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Libraries and only return the `id`
     * const libraryWithIdOnly = await prisma.library.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends LibraryCreateManyAndReturnArgs>(args?: SelectSubset<T, LibraryCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$LibraryPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a Library.
     * @param {LibraryDeleteArgs} args - Arguments to delete one Library.
     * @example
     * // Delete one Library
     * const Library = await prisma.library.delete({
     *   where: {
     *     // ... filter to delete one Library
     *   }
     * })
     * 
     */
    delete<T extends LibraryDeleteArgs>(args: SelectSubset<T, LibraryDeleteArgs<ExtArgs>>): Prisma__LibraryClient<$Result.GetResult<Prisma.$LibraryPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one Library.
     * @param {LibraryUpdateArgs} args - Arguments to update one Library.
     * @example
     * // Update one Library
     * const library = await prisma.library.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends LibraryUpdateArgs>(args: SelectSubset<T, LibraryUpdateArgs<ExtArgs>>): Prisma__LibraryClient<$Result.GetResult<Prisma.$LibraryPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more Libraries.
     * @param {LibraryDeleteManyArgs} args - Arguments to filter Libraries to delete.
     * @example
     * // Delete a few Libraries
     * const { count } = await prisma.library.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends LibraryDeleteManyArgs>(args?: SelectSubset<T, LibraryDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Libraries.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LibraryUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Libraries
     * const library = await prisma.library.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends LibraryUpdateManyArgs>(args: SelectSubset<T, LibraryUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Library.
     * @param {LibraryUpsertArgs} args - Arguments to update or create a Library.
     * @example
     * // Update or create a Library
     * const library = await prisma.library.upsert({
     *   create: {
     *     // ... data to create a Library
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Library we want to update
     *   }
     * })
     */
    upsert<T extends LibraryUpsertArgs>(args: SelectSubset<T, LibraryUpsertArgs<ExtArgs>>): Prisma__LibraryClient<$Result.GetResult<Prisma.$LibraryPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of Libraries.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LibraryCountArgs} args - Arguments to filter Libraries to count.
     * @example
     * // Count the number of Libraries
     * const count = await prisma.library.count({
     *   where: {
     *     // ... the filter for the Libraries we want to count
     *   }
     * })
    **/
    count<T extends LibraryCountArgs>(
      args?: Subset<T, LibraryCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], LibraryCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Library.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LibraryAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends LibraryAggregateArgs>(args: Subset<T, LibraryAggregateArgs>): Prisma.PrismaPromise<GetLibraryAggregateType<T>>

    /**
     * Group by Library.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LibraryGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends LibraryGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: LibraryGroupByArgs['orderBy'] }
        : { orderBy?: LibraryGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, LibraryGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetLibraryGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Library model
   */
  readonly fields: LibraryFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Library.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__LibraryClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Library model
   */ 
  interface LibraryFieldRefs {
    readonly id: FieldRef<"Library", 'String'>
    readonly items: FieldRef<"Library", 'String'>
    readonly createdAt: FieldRef<"Library", 'DateTime'>
    readonly updatedAt: FieldRef<"Library", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Library findUnique
   */
  export type LibraryFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Library
     */
    select?: LibrarySelect<ExtArgs> | null
    /**
     * Filter, which Library to fetch.
     */
    where: LibraryWhereUniqueInput
  }

  /**
   * Library findUniqueOrThrow
   */
  export type LibraryFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Library
     */
    select?: LibrarySelect<ExtArgs> | null
    /**
     * Filter, which Library to fetch.
     */
    where: LibraryWhereUniqueInput
  }

  /**
   * Library findFirst
   */
  export type LibraryFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Library
     */
    select?: LibrarySelect<ExtArgs> | null
    /**
     * Filter, which Library to fetch.
     */
    where?: LibraryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Libraries to fetch.
     */
    orderBy?: LibraryOrderByWithRelationInput | LibraryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Libraries.
     */
    cursor?: LibraryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Libraries from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Libraries.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Libraries.
     */
    distinct?: LibraryScalarFieldEnum | LibraryScalarFieldEnum[]
  }

  /**
   * Library findFirstOrThrow
   */
  export type LibraryFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Library
     */
    select?: LibrarySelect<ExtArgs> | null
    /**
     * Filter, which Library to fetch.
     */
    where?: LibraryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Libraries to fetch.
     */
    orderBy?: LibraryOrderByWithRelationInput | LibraryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Libraries.
     */
    cursor?: LibraryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Libraries from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Libraries.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Libraries.
     */
    distinct?: LibraryScalarFieldEnum | LibraryScalarFieldEnum[]
  }

  /**
   * Library findMany
   */
  export type LibraryFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Library
     */
    select?: LibrarySelect<ExtArgs> | null
    /**
     * Filter, which Libraries to fetch.
     */
    where?: LibraryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Libraries to fetch.
     */
    orderBy?: LibraryOrderByWithRelationInput | LibraryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Libraries.
     */
    cursor?: LibraryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Libraries from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Libraries.
     */
    skip?: number
    distinct?: LibraryScalarFieldEnum | LibraryScalarFieldEnum[]
  }

  /**
   * Library create
   */
  export type LibraryCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Library
     */
    select?: LibrarySelect<ExtArgs> | null
    /**
     * The data needed to create a Library.
     */
    data: XOR<LibraryCreateInput, LibraryUncheckedCreateInput>
  }

  /**
   * Library createMany
   */
  export type LibraryCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Libraries.
     */
    data: LibraryCreateManyInput | LibraryCreateManyInput[]
  }

  /**
   * Library createManyAndReturn
   */
  export type LibraryCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Library
     */
    select?: LibrarySelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many Libraries.
     */
    data: LibraryCreateManyInput | LibraryCreateManyInput[]
  }

  /**
   * Library update
   */
  export type LibraryUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Library
     */
    select?: LibrarySelect<ExtArgs> | null
    /**
     * The data needed to update a Library.
     */
    data: XOR<LibraryUpdateInput, LibraryUncheckedUpdateInput>
    /**
     * Choose, which Library to update.
     */
    where: LibraryWhereUniqueInput
  }

  /**
   * Library updateMany
   */
  export type LibraryUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Libraries.
     */
    data: XOR<LibraryUpdateManyMutationInput, LibraryUncheckedUpdateManyInput>
    /**
     * Filter which Libraries to update
     */
    where?: LibraryWhereInput
  }

  /**
   * Library upsert
   */
  export type LibraryUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Library
     */
    select?: LibrarySelect<ExtArgs> | null
    /**
     * The filter to search for the Library to update in case it exists.
     */
    where: LibraryWhereUniqueInput
    /**
     * In case the Library found by the `where` argument doesn't exist, create a new Library with this data.
     */
    create: XOR<LibraryCreateInput, LibraryUncheckedCreateInput>
    /**
     * In case the Library was found with the provided `where` argument, update it with this data.
     */
    update: XOR<LibraryUpdateInput, LibraryUncheckedUpdateInput>
  }

  /**
   * Library delete
   */
  export type LibraryDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Library
     */
    select?: LibrarySelect<ExtArgs> | null
    /**
     * Filter which Library to delete.
     */
    where: LibraryWhereUniqueInput
  }

  /**
   * Library deleteMany
   */
  export type LibraryDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Libraries to delete
     */
    where?: LibraryWhereInput
  }

  /**
   * Library without action
   */
  export type LibraryDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Library
     */
    select?: LibrarySelect<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const CollectionScalarFieldEnum: {
    id: 'id',
    name: 'name',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type CollectionScalarFieldEnum = (typeof CollectionScalarFieldEnum)[keyof typeof CollectionScalarFieldEnum]


  export const DrawingScalarFieldEnum: {
    id: 'id',
    name: 'name',
    elements: 'elements',
    appState: 'appState',
    files: 'files',
    preview: 'preview',
    version: 'version',
    collectionId: 'collectionId',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    isPrivate: 'isPrivate',
    encryptedData: 'encryptedData',
    iv: 'iv'
  };

  export type DrawingScalarFieldEnum = (typeof DrawingScalarFieldEnum)[keyof typeof DrawingScalarFieldEnum]


  export const PrivateVaultScalarFieldEnum: {
    id: 'id',
    passwordHash: 'passwordHash',
    salt: 'salt',
    hint: 'hint',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type PrivateVaultScalarFieldEnum = (typeof PrivateVaultScalarFieldEnum)[keyof typeof PrivateVaultScalarFieldEnum]


  export const LibraryScalarFieldEnum: {
    id: 'id',
    items: 'items',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type LibraryScalarFieldEnum = (typeof LibraryScalarFieldEnum)[keyof typeof LibraryScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references 
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    
  /**
   * Deep Input Types
   */


  export type CollectionWhereInput = {
    AND?: CollectionWhereInput | CollectionWhereInput[]
    OR?: CollectionWhereInput[]
    NOT?: CollectionWhereInput | CollectionWhereInput[]
    id?: StringFilter<"Collection"> | string
    name?: StringFilter<"Collection"> | string
    createdAt?: DateTimeFilter<"Collection"> | Date | string
    updatedAt?: DateTimeFilter<"Collection"> | Date | string
    drawings?: DrawingListRelationFilter
  }

  export type CollectionOrderByWithRelationInput = {
    id?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    drawings?: DrawingOrderByRelationAggregateInput
  }

  export type CollectionWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: CollectionWhereInput | CollectionWhereInput[]
    OR?: CollectionWhereInput[]
    NOT?: CollectionWhereInput | CollectionWhereInput[]
    name?: StringFilter<"Collection"> | string
    createdAt?: DateTimeFilter<"Collection"> | Date | string
    updatedAt?: DateTimeFilter<"Collection"> | Date | string
    drawings?: DrawingListRelationFilter
  }, "id">

  export type CollectionOrderByWithAggregationInput = {
    id?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: CollectionCountOrderByAggregateInput
    _max?: CollectionMaxOrderByAggregateInput
    _min?: CollectionMinOrderByAggregateInput
  }

  export type CollectionScalarWhereWithAggregatesInput = {
    AND?: CollectionScalarWhereWithAggregatesInput | CollectionScalarWhereWithAggregatesInput[]
    OR?: CollectionScalarWhereWithAggregatesInput[]
    NOT?: CollectionScalarWhereWithAggregatesInput | CollectionScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Collection"> | string
    name?: StringWithAggregatesFilter<"Collection"> | string
    createdAt?: DateTimeWithAggregatesFilter<"Collection"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Collection"> | Date | string
  }

  export type DrawingWhereInput = {
    AND?: DrawingWhereInput | DrawingWhereInput[]
    OR?: DrawingWhereInput[]
    NOT?: DrawingWhereInput | DrawingWhereInput[]
    id?: StringFilter<"Drawing"> | string
    name?: StringFilter<"Drawing"> | string
    elements?: StringFilter<"Drawing"> | string
    appState?: StringFilter<"Drawing"> | string
    files?: StringFilter<"Drawing"> | string
    preview?: StringNullableFilter<"Drawing"> | string | null
    version?: IntFilter<"Drawing"> | number
    collectionId?: StringNullableFilter<"Drawing"> | string | null
    createdAt?: DateTimeFilter<"Drawing"> | Date | string
    updatedAt?: DateTimeFilter<"Drawing"> | Date | string
    isPrivate?: BoolFilter<"Drawing"> | boolean
    encryptedData?: StringNullableFilter<"Drawing"> | string | null
    iv?: StringNullableFilter<"Drawing"> | string | null
    collection?: XOR<CollectionNullableRelationFilter, CollectionWhereInput> | null
  }

  export type DrawingOrderByWithRelationInput = {
    id?: SortOrder
    name?: SortOrder
    elements?: SortOrder
    appState?: SortOrder
    files?: SortOrder
    preview?: SortOrderInput | SortOrder
    version?: SortOrder
    collectionId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    isPrivate?: SortOrder
    encryptedData?: SortOrderInput | SortOrder
    iv?: SortOrderInput | SortOrder
    collection?: CollectionOrderByWithRelationInput
  }

  export type DrawingWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: DrawingWhereInput | DrawingWhereInput[]
    OR?: DrawingWhereInput[]
    NOT?: DrawingWhereInput | DrawingWhereInput[]
    name?: StringFilter<"Drawing"> | string
    elements?: StringFilter<"Drawing"> | string
    appState?: StringFilter<"Drawing"> | string
    files?: StringFilter<"Drawing"> | string
    preview?: StringNullableFilter<"Drawing"> | string | null
    version?: IntFilter<"Drawing"> | number
    collectionId?: StringNullableFilter<"Drawing"> | string | null
    createdAt?: DateTimeFilter<"Drawing"> | Date | string
    updatedAt?: DateTimeFilter<"Drawing"> | Date | string
    isPrivate?: BoolFilter<"Drawing"> | boolean
    encryptedData?: StringNullableFilter<"Drawing"> | string | null
    iv?: StringNullableFilter<"Drawing"> | string | null
    collection?: XOR<CollectionNullableRelationFilter, CollectionWhereInput> | null
  }, "id">

  export type DrawingOrderByWithAggregationInput = {
    id?: SortOrder
    name?: SortOrder
    elements?: SortOrder
    appState?: SortOrder
    files?: SortOrder
    preview?: SortOrderInput | SortOrder
    version?: SortOrder
    collectionId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    isPrivate?: SortOrder
    encryptedData?: SortOrderInput | SortOrder
    iv?: SortOrderInput | SortOrder
    _count?: DrawingCountOrderByAggregateInput
    _avg?: DrawingAvgOrderByAggregateInput
    _max?: DrawingMaxOrderByAggregateInput
    _min?: DrawingMinOrderByAggregateInput
    _sum?: DrawingSumOrderByAggregateInput
  }

  export type DrawingScalarWhereWithAggregatesInput = {
    AND?: DrawingScalarWhereWithAggregatesInput | DrawingScalarWhereWithAggregatesInput[]
    OR?: DrawingScalarWhereWithAggregatesInput[]
    NOT?: DrawingScalarWhereWithAggregatesInput | DrawingScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Drawing"> | string
    name?: StringWithAggregatesFilter<"Drawing"> | string
    elements?: StringWithAggregatesFilter<"Drawing"> | string
    appState?: StringWithAggregatesFilter<"Drawing"> | string
    files?: StringWithAggregatesFilter<"Drawing"> | string
    preview?: StringNullableWithAggregatesFilter<"Drawing"> | string | null
    version?: IntWithAggregatesFilter<"Drawing"> | number
    collectionId?: StringNullableWithAggregatesFilter<"Drawing"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"Drawing"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Drawing"> | Date | string
    isPrivate?: BoolWithAggregatesFilter<"Drawing"> | boolean
    encryptedData?: StringNullableWithAggregatesFilter<"Drawing"> | string | null
    iv?: StringNullableWithAggregatesFilter<"Drawing"> | string | null
  }

  export type PrivateVaultWhereInput = {
    AND?: PrivateVaultWhereInput | PrivateVaultWhereInput[]
    OR?: PrivateVaultWhereInput[]
    NOT?: PrivateVaultWhereInput | PrivateVaultWhereInput[]
    id?: StringFilter<"PrivateVault"> | string
    passwordHash?: StringFilter<"PrivateVault"> | string
    salt?: StringFilter<"PrivateVault"> | string
    hint?: StringNullableFilter<"PrivateVault"> | string | null
    createdAt?: DateTimeFilter<"PrivateVault"> | Date | string
    updatedAt?: DateTimeFilter<"PrivateVault"> | Date | string
  }

  export type PrivateVaultOrderByWithRelationInput = {
    id?: SortOrder
    passwordHash?: SortOrder
    salt?: SortOrder
    hint?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PrivateVaultWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: PrivateVaultWhereInput | PrivateVaultWhereInput[]
    OR?: PrivateVaultWhereInput[]
    NOT?: PrivateVaultWhereInput | PrivateVaultWhereInput[]
    passwordHash?: StringFilter<"PrivateVault"> | string
    salt?: StringFilter<"PrivateVault"> | string
    hint?: StringNullableFilter<"PrivateVault"> | string | null
    createdAt?: DateTimeFilter<"PrivateVault"> | Date | string
    updatedAt?: DateTimeFilter<"PrivateVault"> | Date | string
  }, "id">

  export type PrivateVaultOrderByWithAggregationInput = {
    id?: SortOrder
    passwordHash?: SortOrder
    salt?: SortOrder
    hint?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: PrivateVaultCountOrderByAggregateInput
    _max?: PrivateVaultMaxOrderByAggregateInput
    _min?: PrivateVaultMinOrderByAggregateInput
  }

  export type PrivateVaultScalarWhereWithAggregatesInput = {
    AND?: PrivateVaultScalarWhereWithAggregatesInput | PrivateVaultScalarWhereWithAggregatesInput[]
    OR?: PrivateVaultScalarWhereWithAggregatesInput[]
    NOT?: PrivateVaultScalarWhereWithAggregatesInput | PrivateVaultScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"PrivateVault"> | string
    passwordHash?: StringWithAggregatesFilter<"PrivateVault"> | string
    salt?: StringWithAggregatesFilter<"PrivateVault"> | string
    hint?: StringNullableWithAggregatesFilter<"PrivateVault"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"PrivateVault"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"PrivateVault"> | Date | string
  }

  export type LibraryWhereInput = {
    AND?: LibraryWhereInput | LibraryWhereInput[]
    OR?: LibraryWhereInput[]
    NOT?: LibraryWhereInput | LibraryWhereInput[]
    id?: StringFilter<"Library"> | string
    items?: StringFilter<"Library"> | string
    createdAt?: DateTimeFilter<"Library"> | Date | string
    updatedAt?: DateTimeFilter<"Library"> | Date | string
  }

  export type LibraryOrderByWithRelationInput = {
    id?: SortOrder
    items?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type LibraryWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: LibraryWhereInput | LibraryWhereInput[]
    OR?: LibraryWhereInput[]
    NOT?: LibraryWhereInput | LibraryWhereInput[]
    items?: StringFilter<"Library"> | string
    createdAt?: DateTimeFilter<"Library"> | Date | string
    updatedAt?: DateTimeFilter<"Library"> | Date | string
  }, "id">

  export type LibraryOrderByWithAggregationInput = {
    id?: SortOrder
    items?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: LibraryCountOrderByAggregateInput
    _max?: LibraryMaxOrderByAggregateInput
    _min?: LibraryMinOrderByAggregateInput
  }

  export type LibraryScalarWhereWithAggregatesInput = {
    AND?: LibraryScalarWhereWithAggregatesInput | LibraryScalarWhereWithAggregatesInput[]
    OR?: LibraryScalarWhereWithAggregatesInput[]
    NOT?: LibraryScalarWhereWithAggregatesInput | LibraryScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Library"> | string
    items?: StringWithAggregatesFilter<"Library"> | string
    createdAt?: DateTimeWithAggregatesFilter<"Library"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Library"> | Date | string
  }

  export type CollectionCreateInput = {
    id?: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    drawings?: DrawingCreateNestedManyWithoutCollectionInput
  }

  export type CollectionUncheckedCreateInput = {
    id?: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    drawings?: DrawingUncheckedCreateNestedManyWithoutCollectionInput
  }

  export type CollectionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    drawings?: DrawingUpdateManyWithoutCollectionNestedInput
  }

  export type CollectionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    drawings?: DrawingUncheckedUpdateManyWithoutCollectionNestedInput
  }

  export type CollectionCreateManyInput = {
    id?: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type CollectionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CollectionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type DrawingCreateInput = {
    id?: string
    name: string
    elements: string
    appState: string
    files?: string
    preview?: string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    isPrivate?: boolean
    encryptedData?: string | null
    iv?: string | null
    collection?: CollectionCreateNestedOneWithoutDrawingsInput
  }

  export type DrawingUncheckedCreateInput = {
    id?: string
    name: string
    elements: string
    appState: string
    files?: string
    preview?: string | null
    version?: number
    collectionId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    isPrivate?: boolean
    encryptedData?: string | null
    iv?: string | null
  }

  export type DrawingUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    elements?: StringFieldUpdateOperationsInput | string
    appState?: StringFieldUpdateOperationsInput | string
    files?: StringFieldUpdateOperationsInput | string
    preview?: NullableStringFieldUpdateOperationsInput | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    isPrivate?: BoolFieldUpdateOperationsInput | boolean
    encryptedData?: NullableStringFieldUpdateOperationsInput | string | null
    iv?: NullableStringFieldUpdateOperationsInput | string | null
    collection?: CollectionUpdateOneWithoutDrawingsNestedInput
  }

  export type DrawingUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    elements?: StringFieldUpdateOperationsInput | string
    appState?: StringFieldUpdateOperationsInput | string
    files?: StringFieldUpdateOperationsInput | string
    preview?: NullableStringFieldUpdateOperationsInput | string | null
    version?: IntFieldUpdateOperationsInput | number
    collectionId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    isPrivate?: BoolFieldUpdateOperationsInput | boolean
    encryptedData?: NullableStringFieldUpdateOperationsInput | string | null
    iv?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type DrawingCreateManyInput = {
    id?: string
    name: string
    elements: string
    appState: string
    files?: string
    preview?: string | null
    version?: number
    collectionId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    isPrivate?: boolean
    encryptedData?: string | null
    iv?: string | null
  }

  export type DrawingUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    elements?: StringFieldUpdateOperationsInput | string
    appState?: StringFieldUpdateOperationsInput | string
    files?: StringFieldUpdateOperationsInput | string
    preview?: NullableStringFieldUpdateOperationsInput | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    isPrivate?: BoolFieldUpdateOperationsInput | boolean
    encryptedData?: NullableStringFieldUpdateOperationsInput | string | null
    iv?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type DrawingUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    elements?: StringFieldUpdateOperationsInput | string
    appState?: StringFieldUpdateOperationsInput | string
    files?: StringFieldUpdateOperationsInput | string
    preview?: NullableStringFieldUpdateOperationsInput | string | null
    version?: IntFieldUpdateOperationsInput | number
    collectionId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    isPrivate?: BoolFieldUpdateOperationsInput | boolean
    encryptedData?: NullableStringFieldUpdateOperationsInput | string | null
    iv?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type PrivateVaultCreateInput = {
    id?: string
    passwordHash: string
    salt: string
    hint?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PrivateVaultUncheckedCreateInput = {
    id?: string
    passwordHash: string
    salt: string
    hint?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PrivateVaultUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    salt?: StringFieldUpdateOperationsInput | string
    hint?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PrivateVaultUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    salt?: StringFieldUpdateOperationsInput | string
    hint?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PrivateVaultCreateManyInput = {
    id?: string
    passwordHash: string
    salt: string
    hint?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PrivateVaultUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    salt?: StringFieldUpdateOperationsInput | string
    hint?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PrivateVaultUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    salt?: StringFieldUpdateOperationsInput | string
    hint?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type LibraryCreateInput = {
    id?: string
    items?: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type LibraryUncheckedCreateInput = {
    id?: string
    items?: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type LibraryUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    items?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type LibraryUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    items?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type LibraryCreateManyInput = {
    id?: string
    items?: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type LibraryUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    items?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type LibraryUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    items?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type DrawingListRelationFilter = {
    every?: DrawingWhereInput
    some?: DrawingWhereInput
    none?: DrawingWhereInput
  }

  export type DrawingOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type CollectionCountOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type CollectionMaxOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type CollectionMinOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type CollectionNullableRelationFilter = {
    is?: CollectionWhereInput | null
    isNot?: CollectionWhereInput | null
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type DrawingCountOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    elements?: SortOrder
    appState?: SortOrder
    files?: SortOrder
    preview?: SortOrder
    version?: SortOrder
    collectionId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    isPrivate?: SortOrder
    encryptedData?: SortOrder
    iv?: SortOrder
  }

  export type DrawingAvgOrderByAggregateInput = {
    version?: SortOrder
  }

  export type DrawingMaxOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    elements?: SortOrder
    appState?: SortOrder
    files?: SortOrder
    preview?: SortOrder
    version?: SortOrder
    collectionId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    isPrivate?: SortOrder
    encryptedData?: SortOrder
    iv?: SortOrder
  }

  export type DrawingMinOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    elements?: SortOrder
    appState?: SortOrder
    files?: SortOrder
    preview?: SortOrder
    version?: SortOrder
    collectionId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    isPrivate?: SortOrder
    encryptedData?: SortOrder
    iv?: SortOrder
  }

  export type DrawingSumOrderByAggregateInput = {
    version?: SortOrder
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type PrivateVaultCountOrderByAggregateInput = {
    id?: SortOrder
    passwordHash?: SortOrder
    salt?: SortOrder
    hint?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PrivateVaultMaxOrderByAggregateInput = {
    id?: SortOrder
    passwordHash?: SortOrder
    salt?: SortOrder
    hint?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PrivateVaultMinOrderByAggregateInput = {
    id?: SortOrder
    passwordHash?: SortOrder
    salt?: SortOrder
    hint?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type LibraryCountOrderByAggregateInput = {
    id?: SortOrder
    items?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type LibraryMaxOrderByAggregateInput = {
    id?: SortOrder
    items?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type LibraryMinOrderByAggregateInput = {
    id?: SortOrder
    items?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type DrawingCreateNestedManyWithoutCollectionInput = {
    create?: XOR<DrawingCreateWithoutCollectionInput, DrawingUncheckedCreateWithoutCollectionInput> | DrawingCreateWithoutCollectionInput[] | DrawingUncheckedCreateWithoutCollectionInput[]
    connectOrCreate?: DrawingCreateOrConnectWithoutCollectionInput | DrawingCreateOrConnectWithoutCollectionInput[]
    createMany?: DrawingCreateManyCollectionInputEnvelope
    connect?: DrawingWhereUniqueInput | DrawingWhereUniqueInput[]
  }

  export type DrawingUncheckedCreateNestedManyWithoutCollectionInput = {
    create?: XOR<DrawingCreateWithoutCollectionInput, DrawingUncheckedCreateWithoutCollectionInput> | DrawingCreateWithoutCollectionInput[] | DrawingUncheckedCreateWithoutCollectionInput[]
    connectOrCreate?: DrawingCreateOrConnectWithoutCollectionInput | DrawingCreateOrConnectWithoutCollectionInput[]
    createMany?: DrawingCreateManyCollectionInputEnvelope
    connect?: DrawingWhereUniqueInput | DrawingWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type DrawingUpdateManyWithoutCollectionNestedInput = {
    create?: XOR<DrawingCreateWithoutCollectionInput, DrawingUncheckedCreateWithoutCollectionInput> | DrawingCreateWithoutCollectionInput[] | DrawingUncheckedCreateWithoutCollectionInput[]
    connectOrCreate?: DrawingCreateOrConnectWithoutCollectionInput | DrawingCreateOrConnectWithoutCollectionInput[]
    upsert?: DrawingUpsertWithWhereUniqueWithoutCollectionInput | DrawingUpsertWithWhereUniqueWithoutCollectionInput[]
    createMany?: DrawingCreateManyCollectionInputEnvelope
    set?: DrawingWhereUniqueInput | DrawingWhereUniqueInput[]
    disconnect?: DrawingWhereUniqueInput | DrawingWhereUniqueInput[]
    delete?: DrawingWhereUniqueInput | DrawingWhereUniqueInput[]
    connect?: DrawingWhereUniqueInput | DrawingWhereUniqueInput[]
    update?: DrawingUpdateWithWhereUniqueWithoutCollectionInput | DrawingUpdateWithWhereUniqueWithoutCollectionInput[]
    updateMany?: DrawingUpdateManyWithWhereWithoutCollectionInput | DrawingUpdateManyWithWhereWithoutCollectionInput[]
    deleteMany?: DrawingScalarWhereInput | DrawingScalarWhereInput[]
  }

  export type DrawingUncheckedUpdateManyWithoutCollectionNestedInput = {
    create?: XOR<DrawingCreateWithoutCollectionInput, DrawingUncheckedCreateWithoutCollectionInput> | DrawingCreateWithoutCollectionInput[] | DrawingUncheckedCreateWithoutCollectionInput[]
    connectOrCreate?: DrawingCreateOrConnectWithoutCollectionInput | DrawingCreateOrConnectWithoutCollectionInput[]
    upsert?: DrawingUpsertWithWhereUniqueWithoutCollectionInput | DrawingUpsertWithWhereUniqueWithoutCollectionInput[]
    createMany?: DrawingCreateManyCollectionInputEnvelope
    set?: DrawingWhereUniqueInput | DrawingWhereUniqueInput[]
    disconnect?: DrawingWhereUniqueInput | DrawingWhereUniqueInput[]
    delete?: DrawingWhereUniqueInput | DrawingWhereUniqueInput[]
    connect?: DrawingWhereUniqueInput | DrawingWhereUniqueInput[]
    update?: DrawingUpdateWithWhereUniqueWithoutCollectionInput | DrawingUpdateWithWhereUniqueWithoutCollectionInput[]
    updateMany?: DrawingUpdateManyWithWhereWithoutCollectionInput | DrawingUpdateManyWithWhereWithoutCollectionInput[]
    deleteMany?: DrawingScalarWhereInput | DrawingScalarWhereInput[]
  }

  export type CollectionCreateNestedOneWithoutDrawingsInput = {
    create?: XOR<CollectionCreateWithoutDrawingsInput, CollectionUncheckedCreateWithoutDrawingsInput>
    connectOrCreate?: CollectionCreateOrConnectWithoutDrawingsInput
    connect?: CollectionWhereUniqueInput
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type CollectionUpdateOneWithoutDrawingsNestedInput = {
    create?: XOR<CollectionCreateWithoutDrawingsInput, CollectionUncheckedCreateWithoutDrawingsInput>
    connectOrCreate?: CollectionCreateOrConnectWithoutDrawingsInput
    upsert?: CollectionUpsertWithoutDrawingsInput
    disconnect?: CollectionWhereInput | boolean
    delete?: CollectionWhereInput | boolean
    connect?: CollectionWhereUniqueInput
    update?: XOR<XOR<CollectionUpdateToOneWithWhereWithoutDrawingsInput, CollectionUpdateWithoutDrawingsInput>, CollectionUncheckedUpdateWithoutDrawingsInput>
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type DrawingCreateWithoutCollectionInput = {
    id?: string
    name: string
    elements: string
    appState: string
    files?: string
    preview?: string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    isPrivate?: boolean
    encryptedData?: string | null
    iv?: string | null
  }

  export type DrawingUncheckedCreateWithoutCollectionInput = {
    id?: string
    name: string
    elements: string
    appState: string
    files?: string
    preview?: string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    isPrivate?: boolean
    encryptedData?: string | null
    iv?: string | null
  }

  export type DrawingCreateOrConnectWithoutCollectionInput = {
    where: DrawingWhereUniqueInput
    create: XOR<DrawingCreateWithoutCollectionInput, DrawingUncheckedCreateWithoutCollectionInput>
  }

  export type DrawingCreateManyCollectionInputEnvelope = {
    data: DrawingCreateManyCollectionInput | DrawingCreateManyCollectionInput[]
  }

  export type DrawingUpsertWithWhereUniqueWithoutCollectionInput = {
    where: DrawingWhereUniqueInput
    update: XOR<DrawingUpdateWithoutCollectionInput, DrawingUncheckedUpdateWithoutCollectionInput>
    create: XOR<DrawingCreateWithoutCollectionInput, DrawingUncheckedCreateWithoutCollectionInput>
  }

  export type DrawingUpdateWithWhereUniqueWithoutCollectionInput = {
    where: DrawingWhereUniqueInput
    data: XOR<DrawingUpdateWithoutCollectionInput, DrawingUncheckedUpdateWithoutCollectionInput>
  }

  export type DrawingUpdateManyWithWhereWithoutCollectionInput = {
    where: DrawingScalarWhereInput
    data: XOR<DrawingUpdateManyMutationInput, DrawingUncheckedUpdateManyWithoutCollectionInput>
  }

  export type DrawingScalarWhereInput = {
    AND?: DrawingScalarWhereInput | DrawingScalarWhereInput[]
    OR?: DrawingScalarWhereInput[]
    NOT?: DrawingScalarWhereInput | DrawingScalarWhereInput[]
    id?: StringFilter<"Drawing"> | string
    name?: StringFilter<"Drawing"> | string
    elements?: StringFilter<"Drawing"> | string
    appState?: StringFilter<"Drawing"> | string
    files?: StringFilter<"Drawing"> | string
    preview?: StringNullableFilter<"Drawing"> | string | null
    version?: IntFilter<"Drawing"> | number
    collectionId?: StringNullableFilter<"Drawing"> | string | null
    createdAt?: DateTimeFilter<"Drawing"> | Date | string
    updatedAt?: DateTimeFilter<"Drawing"> | Date | string
    isPrivate?: BoolFilter<"Drawing"> | boolean
    encryptedData?: StringNullableFilter<"Drawing"> | string | null
    iv?: StringNullableFilter<"Drawing"> | string | null
  }

  export type CollectionCreateWithoutDrawingsInput = {
    id?: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type CollectionUncheckedCreateWithoutDrawingsInput = {
    id?: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type CollectionCreateOrConnectWithoutDrawingsInput = {
    where: CollectionWhereUniqueInput
    create: XOR<CollectionCreateWithoutDrawingsInput, CollectionUncheckedCreateWithoutDrawingsInput>
  }

  export type CollectionUpsertWithoutDrawingsInput = {
    update: XOR<CollectionUpdateWithoutDrawingsInput, CollectionUncheckedUpdateWithoutDrawingsInput>
    create: XOR<CollectionCreateWithoutDrawingsInput, CollectionUncheckedCreateWithoutDrawingsInput>
    where?: CollectionWhereInput
  }

  export type CollectionUpdateToOneWithWhereWithoutDrawingsInput = {
    where?: CollectionWhereInput
    data: XOR<CollectionUpdateWithoutDrawingsInput, CollectionUncheckedUpdateWithoutDrawingsInput>
  }

  export type CollectionUpdateWithoutDrawingsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CollectionUncheckedUpdateWithoutDrawingsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type DrawingCreateManyCollectionInput = {
    id?: string
    name: string
    elements: string
    appState: string
    files?: string
    preview?: string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    isPrivate?: boolean
    encryptedData?: string | null
    iv?: string | null
  }

  export type DrawingUpdateWithoutCollectionInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    elements?: StringFieldUpdateOperationsInput | string
    appState?: StringFieldUpdateOperationsInput | string
    files?: StringFieldUpdateOperationsInput | string
    preview?: NullableStringFieldUpdateOperationsInput | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    isPrivate?: BoolFieldUpdateOperationsInput | boolean
    encryptedData?: NullableStringFieldUpdateOperationsInput | string | null
    iv?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type DrawingUncheckedUpdateWithoutCollectionInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    elements?: StringFieldUpdateOperationsInput | string
    appState?: StringFieldUpdateOperationsInput | string
    files?: StringFieldUpdateOperationsInput | string
    preview?: NullableStringFieldUpdateOperationsInput | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    isPrivate?: BoolFieldUpdateOperationsInput | boolean
    encryptedData?: NullableStringFieldUpdateOperationsInput | string | null
    iv?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type DrawingUncheckedUpdateManyWithoutCollectionInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    elements?: StringFieldUpdateOperationsInput | string
    appState?: StringFieldUpdateOperationsInput | string
    files?: StringFieldUpdateOperationsInput | string
    preview?: NullableStringFieldUpdateOperationsInput | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    isPrivate?: BoolFieldUpdateOperationsInput | boolean
    encryptedData?: NullableStringFieldUpdateOperationsInput | string | null
    iv?: NullableStringFieldUpdateOperationsInput | string | null
  }



  /**
   * Aliases for legacy arg types
   */
    /**
     * @deprecated Use CollectionCountOutputTypeDefaultArgs instead
     */
    export type CollectionCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = CollectionCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use CollectionDefaultArgs instead
     */
    export type CollectionArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = CollectionDefaultArgs<ExtArgs>
    /**
     * @deprecated Use DrawingDefaultArgs instead
     */
    export type DrawingArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = DrawingDefaultArgs<ExtArgs>
    /**
     * @deprecated Use PrivateVaultDefaultArgs instead
     */
    export type PrivateVaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = PrivateVaultDefaultArgs<ExtArgs>
    /**
     * @deprecated Use LibraryDefaultArgs instead
     */
    export type LibraryArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = LibraryDefaultArgs<ExtArgs>

  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}