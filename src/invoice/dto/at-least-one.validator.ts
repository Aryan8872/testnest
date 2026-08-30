import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'AtLeastOneOf', async: false })
export class AtLeastOneOfConstraint implements ValidatorConstraintInterface {
  validate(_: any, args: ValidationArguments): boolean {
    const obj = args.object as Record<string, any>;
    if (!obj) return false;
    const properties: string[] = args.constraints;
    return properties.some((p) => {
      const v = obj[p];
      if (v === undefined || v === null) return false;
      if (typeof v === 'string' && v.trim() === '') return false;
      if (typeof v === 'object' && Object.keys(v).length === 0) return false;
      return true;
    });
  }

  defaultMessage(args: ValidationArguments): string {
    return `One of properties ${args.constraints.join(', ')} is required`;
  }
}

/**
 * Class-level decorator. Use on class: @AtLeastOneOf(['customerId','customerData'])
 */
export function AtLeastOneOf(
  properties: string[],
  validationOptions?: ValidationOptions,
) {
  return function (target: any, propertyKey?: string) {
    registerDecorator({
      name: 'AtLeastOneOf',
      target: target.constructor || target,
      propertyName: propertyKey || 'atLeastOneOf',
      options: validationOptions,
      constraints: properties,
      validator: AtLeastOneOfConstraint,
    });
  };
}
