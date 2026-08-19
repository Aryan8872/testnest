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
    const properties: string[] = args.constraints;
    return properties.some((p) => {
      const v = obj[p];
      return (
        v !== undefined &&
        v !== null &&
        !(typeof v === 'string' && v.trim() === '')
      );
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
  return function (constructor: Function) {
    // register a validation on a fake property name on the prototype
    registerDecorator({
      name: 'AtLeastOneOf',
      target: constructor.prototype,
      propertyName: '__atLeastOneOf__', // arbitrary property name
      options: validationOptions,
      constraints: properties,
      validator: AtLeastOneOfConstraint,
    });
  };
}
