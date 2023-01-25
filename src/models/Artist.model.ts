import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Artist {
  @PrimaryGeneratedColumn()
  id?: number;

  @Column({
    type: 'varchar',
    length: 200
  })
  name: string;

  constructor(name: string) {
    this.name = name;
  }
}